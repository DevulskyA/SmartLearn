// T-F1-04: a Windows Job Object with KILL_ON_JOB_CLOSE. The local backend (and everything it starts: the Codex CLI) is assigned
// to it, so when the Desktop process dies by ANY route - including a forced kill, where no destructor runs - the OS closes the
// handle and terminates the whole process tree. Without it a force-closed Desktop left an orphaned `node` (and `codex`) behind.
// Off Windows this is a no-op: the platform has no equivalent need here (the Drop path still covers a normal exit).
use std::process::Child;

#[cfg(windows)]
mod imp {
    use super::Child;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    pub struct KillOnCloseJob(HANDLE);

    // The handle is an opaque kernel object id, only ever used from the owner; closing it from another thread is fine.
    unsafe impl Send for KillOnCloseJob {}
    unsafe impl Sync for KillOnCloseJob {}

    impl KillOnCloseJob {
        pub fn new() -> Result<Self, String> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return Err(format!("CreateJobObjectW failed: {}", std::io::Error::last_os_error()));
                }
                let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
                info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const core::ffi::c_void,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                );
                if ok == 0 {
                    let err = std::io::Error::last_os_error();
                    CloseHandle(handle);
                    return Err(format!("SetInformationJobObject failed: {err}"));
                }
                Ok(Self(handle))
            }
        }

        pub fn assign(&self, child: &Child) -> Result<(), String> {
            let ok = unsafe { AssignProcessToJobObject(self.0, child.as_raw_handle() as HANDLE) };
            if ok == 0 {
                Err(format!("AssignProcessToJobObject failed: {}", std::io::Error::last_os_error()))
            } else {
                Ok(())
            }
        }
    }

    impl Drop for KillOnCloseJob {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Child;

    pub struct KillOnCloseJob;

    impl KillOnCloseJob {
        pub fn new() -> Result<Self, String> {
            Ok(Self)
        }

        pub fn assign(&self, _child: &Child) -> Result<(), String> {
            Ok(())
        }
    }
}

pub use imp::KillOnCloseJob;

/// Best effort by design: a Desktop started inside a tool that already confines its children in a job that forbids nesting must
/// still start. The failure is reported (stderr) and the normal Drop path remains; it is never fatal.
pub fn contain(child: &Child) -> Option<KillOnCloseJob> {
    match KillOnCloseJob::new().and_then(|job| job.assign(child).map(|_| job)) {
        Ok(job) => Some(job),
        Err(err) => {
            eprintln!("smartlearn: could not place the local backend in a kill-on-close job ({err}); a forced close of the app may leave it running");
            None
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::process::{Command, Stdio};
    use std::time::Duration;

    fn free_port() -> u16 {
        TcpListener::bind(("127.0.0.1", 0)).unwrap().local_addr().unwrap().port()
    }

    fn holds_port(port: u16) -> bool {
        TcpListener::bind(("127.0.0.1", port)).is_err()
    }

    fn spawn_port_holder(port: u16) -> Child {
        Command::new("node")
            .arg("-e")
            .arg(format!("require('http').createServer(() => {{}}).listen({port}, '127.0.0.1')"))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("spawn a real node process holding a port")
    }

    fn wait_until(mut condition: impl FnMut() -> bool, tries: u32) -> bool {
        (0..tries).any(|_| {
            if condition() {
                true
            } else {
                std::thread::sleep(Duration::from_millis(100));
                false
            }
        })
    }

    // The mechanism the Desktop relies on: when the handle goes away (here: dropped; in a force-killed Desktop: closed by the OS),
    // the assigned process dies WITHOUT anyone calling kill() on it.
    #[test]
    fn closing_the_job_terminates_the_assigned_process_without_kill() {
        let port = free_port();
        let mut child = spawn_port_holder(port);
        assert!(wait_until(|| holds_port(port), 100), "sanity: the node process must hold the port first");

        let job = contain(&child).expect("the process must be placed in a kill-on-close job");
        assert!(holds_port(port), "still running while the job is open");
        drop(job); // handle closed -> KILL_ON_JOB_CLOSE

        assert!(wait_until(|| !holds_port(port), 100), "the port must become free once the job is closed");
        let _ = child.wait();
    }

    // Descendants inherit the job: a grandchild started by the assigned process (the Codex CLI under node) dies with it too.
    #[test]
    fn a_grandchild_of_the_assigned_process_dies_with_the_job() {
        let port = free_port();
        let script = format!(
            "const {{spawn}}=require('child_process');spawn(process.execPath,['-e',\"require('http').createServer(()=>{{}}).listen({port},'127.0.0.1')\"],{{stdio:'ignore'}});setInterval(()=>{{}},1000)"
        );
        let mut parent = Command::new("node").arg("-e").arg(script).stdout(Stdio::null()).stderr(Stdio::null()).spawn().expect("spawn parent");
        let job = contain(&parent).expect("job");
        assert!(wait_until(|| holds_port(port), 100), "sanity: the grandchild must hold the port");
        drop(job);
        assert!(wait_until(|| !holds_port(port), 100), "the grandchild must be terminated with the job");
        let _ = parent.wait();
    }
}
