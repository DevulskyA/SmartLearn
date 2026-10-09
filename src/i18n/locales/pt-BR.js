// T11: minimal presentation catalog for the account/auth experience.
// Domain error/reason codes (server-side) remain stable identifiers — this
// catalog only maps them to human-readable pt-BR text for display.
export default {
  'auth.login.title': 'Entrar',
  'auth.register.title': 'Criar conta',
  'auth.email.label': 'E-mail',
  'auth.password.label': 'Senha',
  'auth.password.hint': 'Mínimo de 15 caracteres.',
  'auth.newPassword.label': 'Nova senha',
  'auth.currentPassword.label': 'Senha atual',
  'auth.submit.login': 'Entrar',
  'auth.submit.register': 'Criar conta',
  'auth.submit.changePassword': 'Alterar senha',
  'auth.submit.logout': 'Sair',
  'auth.switchToRegister': 'Ainda não tem conta? Criar uma',
  'auth.switchToLogin': 'Já tem conta? Entrar',
  'auth.loggedInAs': 'Conectado como',
  'auth.error.INVALID_CREDENTIALS': 'E-mail ou senha incorretos.',
  'auth.error.EMAIL_CONFLICT': 'Já existe uma conta com este e-mail.',
  'auth.error.VALIDATION_FAILED': 'Verifique os dados informados.',
  'auth.error.INVALID_RESET_TOKEN': 'Token de redefinição inválido ou expirado.',
  'auth.error.UNAUTHENTICATED': 'Sessão expirada. Entre novamente.',
  'auth.error.generic': 'Não foi possível concluir a operação. Tente novamente.',
  'auth.success.register': 'Conta criada com sucesso.',
  'auth.success.passwordChanged': 'Senha alterada com sucesso.',
  'auth.success.loggedOut': 'Sessão encerrada.',
};
