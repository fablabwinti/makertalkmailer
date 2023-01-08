# MakerTalk Mailer

Sendet E-Mail-Benachrichtigungen über kommende MakerTalks aus dem Google-Kalender via TinyLetter und Mailman.

Installiert auf dem FabLab-NAS in _/volume1/makertalkmailer/_ .
Wird alle 15 min ausgeführt via folgende Zeile in _/etc/crontab_:

```
1,16,31,46	*	*	*	*	root	/usr/local/node/nvm/versions/12.22.12/bin/node /volume1/makertalkmailer/index.js
```

(Git für Updates ist installiert als _/volume1/@appstore/Git/bin/git_.
Das kommt vom Synology-Package _Git Server_, aber der Server ist im Package-Manager deaktiviert.)
