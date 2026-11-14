// Source proposals.
export default Object.freeze({
  'proposals.network.unreachable': 'Could not contact the server. Check your connection and try again.',
  'proposals.existing.one': '{count} existing excerpt',
  'proposals.existing.other': '{count} existing excerpts',
  'proposals.processed.message': 'This PDF has already been processed: {shown}, including the work you have already done on these excerpts.',
  'proposals.processed.withSkipped': 'This PDF has already been processed: {shown}, including the work you have already done on these excerpts. {skipped}',
  'proposals.pages.list': 'p. {pages}',
  'proposals.pages.listMore': 'p. {pages} and {more} more',
  'proposals.skipped.empty.one': '{count} page with no extractable text ({pages}) was left out of the excerpts — probably an image or scan. The summary does not cover this page.',
  'proposals.skipped.empty.other': '{count} pages with no extractable text ({pages}) were left out of the excerpts — probably images or scans. The summary does not cover these pages.',
  'proposals.skipped.failed.one': 'Could not read {count} page ({pages}).',
  'proposals.skipped.failed.other': 'Could not read {count} pages ({pages}).',
  'proposals.unreadable.encrypted': 'This PDF is encrypted and cannot be read.',
  'proposals.unreadable.timeout': 'Text extraction timed out.',
  'proposals.unreadable.imageOnly': 'This PDF appears to contain only images (no extractable text). Upload a version with selectable text (for example, exported from the original file), or use Plan to create the lesson by hand.',
  'proposals.unreadable.failed': 'Could not extract text from this PDF.',
});
