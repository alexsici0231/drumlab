# DRUM LAB — Android-сборка и подписанный AAB

Источник: https://github.com/alexsici0231/drumlab
Android app ID: `com.alexsici0231.drumlab`. SDK 36 / Capacitor 8 / Node 22 / JDK 21.

## Тестовый APK (делает CI)
1. Открыть https://github.com/alexsici0231/drumlab/actions.
2. Найти успешный запуск `Android build / DRUM LAB`.
3. Скачать artifact `drumlab-debug-apk`.
4. Распаковать ZIP, установить `app-debug.apk` на Android (может понадобиться разрешение на установку из этого источника).
5. Проверить микрофон, чтение Гц, работу без сети и все четыре барабана.

Это DEBUG APK, для Play Console он не подходит.

## Ключ подписи (делает владелец на своём ПК)
Не отправлять ключ или пароли в чат и не хранить их в GitHub-репозитории.
На устройстве с JDK 21 выполнить:

```bash
keytool -genkeypair -v -keystore drumlab-upload.jks -alias drumlab-upload -keyalg RSA -keysize 3072 -validity 10000
```

Сохранить `.jks`, alias и оба пароля в надёжном зашифрованном хранилище и резервной копии. В разделе GitHub Settings → Secrets and variables → Actions создать четыре секрета:

`DRUMLAB_UPLOAD_KEYSTORE_B64` — Base64-представление содержимого `drumlab-upload.jks`.
`DRUMLAB_KEYSTORE_PASSWORD` — пароль keystore.
`DRUMLAB_KEY_ALIAS` — drumlab-upload.
`DRUMLAB_KEY_PASSWORD` — пароль конкретного ключа.

Команды для Base64: Linux/macOS `base64 -w0 drumlab-upload.jks` (на macOS: `base64 -i drumlab-upload.jks | tr -d '\\n'`). На Windows используйте PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes('drumlab-upload.jks'))`.
Выполнить повторный запуск workflow (Run workflow). При наличии четырёх секретов шаг подписи создаст artifact `drumlab-signed-aab`. Использовать Google Play App Signing.

## Сборка самостоятельно
Требуются Android Studio, Android SDK API 36, Node 22, JDK 21, Python 3 и Pillow.

```bash
npm install
npm test
npm run android:init
python3 -m pip install pillow
python3 scripts/configure_android.py
cd android
./gradlew assembleDebug bundleRelease
```

На Windows вместо `./gradlew` использовать `gradlew.bat`. В GitHub Actions native `android/` проект воспроизводимо генерируется при каждой сборке.

## Важно проверить
- Возможность записи через WebView микрофон с Android `RECORD_AUDIO`.
- Отказ разрешения и повторный запрос.
- Импорт JSON через Android file picker.
- Офлайн-запуск после установки.
- Разницу в качестве определения частоты между телефонами.
- Строку package ID до ПЕРВОГО Play-релиза (после публикации меняют только с новым приложением).
