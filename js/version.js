// Einzige Stelle für die Versionsnummer (Semantic Versioning: MAJOR.MINOR.PATCH).
// Wird von der App (Anzeige im Menü) und vom Service Worker (Cache-Name) gelesen.
// Neues Release: hier erhöhen, CHANGELOG.md ergänzen, Git-Tag vX.Y.Z setzen (siehe README).
const APP_VERSION = '1.0.0';

if (typeof module !== 'undefined') module.exports = { APP_VERSION };
