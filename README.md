# Android beta 1.2 — DRUM LAB for Google Play

The Android release preparation uses Capacitor 8 (Android API 36) with local bundled HTML, JS, CSS and microphone access.

- [Android build workflow](.github/workflows/android.yml): debug APK artifact after success.
- [Google Play checklist](docs/GOOGLE_PLAY_CHECKLIST_RU.md)
- [Android build and signing guide](docs/ANDROID_BUILD_RU.md)
- [Privacy policy](privacy.html)

Note: debug APK is a test build, not a signed Google Play release. Test on real drums and devices before publication.

---

# DRUM LAB — личный тюнер барабанов

Рабочий прототип мобильного веб-приложения (PWA) на русском языке. Не требует регистрации, рекламы, подписки, сервера или внешних библиотек. Исходный код открыт и находится в файлах этой папки.

## Что умеет

- Автоматически распознаёт лёгкий удар по пластику через микрофон.
- Выводит предполагаемую резонансную частоту (Гц), ближайшую музыкальную ноту и отклонение в центах.
- Показывает частоты у каждого винта (4, 6, 8, 10 или 12 винтов), медиану частот и разброс.
- Отдельно хранит данные для ударного и резонансного пластиков, а также общего тона барабана.
- Позволяет задать эталонную частоту, допуск и чувствительность.
- Поддерживает фильтр ±18% от правильного пика для защиты от ошибочного выбора другого обертона.
- Показывает спектр и позволяет вручную выбрать другой обнаруженный частотный пик.
- Сохраняет замеры и настройки **только локально в браузере**. Есть резервное копирование и восстановление через JSON.
- После открытия по HTTPS может устанавливаться на домашний экран и работать без сети после первой загрузки.

## Как запустить на Android (рекомендуемый способ)

**Микрофон в браузере требует безопасное подключение: HTTPS или localhost.** Поэтому просто открыть `index.html` из архива на телефоне — ненадёжный способ. Для нормальной работы используйте статический HTTPS-хостинг, например GitHub Pages.

1. Распакуйте архив. Создайте в GitHub новый репозиторий, например `drumlab`.
2. Загрузите **все файлы и папку `icons`** из архива в корень репозитория (кнопка **Add file → Upload files**).
3. В репозитории откройте **Settings → Pages**. В разделе **Build and deployment** выберите **Deploy from a branch**, ветку **main**, папку **/(root)**. Сохраните.
4. Откройте выданную GitHub Pages ссылку вида `https://<username>.github.io/drumlab/` в **Chrome** на Android.
5. Нажмите **Включить микрофон** и разрешите доступ.
6. В меню Chrome выберите **Установить приложение** / **Добавить на главный экран**.

Примечание: если репозиторий публичный, то исходный код приложения публичен, однако **ваши данные и звук остаются локально на телефоне**. Для приватного кода используйте подходящий приватный хостинг с HTTPS. GitHub Pages на бесплатных планах может требовать публичный репозиторий.

## Как запустить на компьютере

Из этой папки выполните команду:

```bash
python3 -m http.server 8000
```

Затем откройте `http://localhost:8000/` в Chrome/Edge. Браузер запросит доступ к микрофону.

Тесты DSP (если установлен Node.js):

```bash
npm test
```

## Как правильно измерять

1. При настройке винтов приглушите противоположный пластик, положив барабан на мягкую поверхность или использовав другие безопасные способы демпфирования. Для общего тона («По центру») оба пластика должны звучать свободно.
2. Выберите нужный барабан и пластик. Положите телефон рядом с соответствующим пластиком, не заслоняя микрофон.
3. Выберите первый винт на схеме, слегка ударьте палочкой примерно в 2–3 см от обода, дождитесь измерения. Повторите 2–3 раза для проверки стабильности.
4. При первом стабильном результате при необходимости нажмите «Зафиксировать тон» — приложение будет искать пики в пределах ±18% от него.
5. По очереди измерьте остальные винты, постепенно подтягивая отстающие. Ориентир для одинакового локального тона — **примерно ±2 Гц**, если измерения достаточно стабильны.
6. Для измерения общего тона переключитесь на «По центру». Частота при ударе в центр **обычно не равна** частоте около винтов.

Эти инструкции согласуются с общим принципом Tune-Bot: https://tune-bot.com/instructions/ и https://tune-bot.com/instructions-tune-bot-gig/ .

## Что важно знать о точности

- Это **MVP-прототип**, а не поверенный измерительный прибор и не точная копия алгоритмов коммерческих тюнеров. DSP проверен на искусственно синтезированных звуках. На реальных барабанах и на конкретном телефоне его требуется проверить.
- У барабанов есть несколько негармонических резонансов. Самый громкий пик FFT может быть обертоном, поэтому предусмотрены ручной выбор пика и фильтр.
- Некоторые встроенные микрофоны плохо воспринимают низкие частоты бочки (40–70 Гц). Bluetooth-гарнитуры и системная обработка аудио также могут исказить результаты.
- В очень шумной комнате измерения будут ненадёжными. Если частоты скачут, уменьшите чувствительность, попробуйте другую дистанцию и включите фильтр после нахождения правильного пика.
- Приложение **не хранит и не передаёт аудиозаписи**. После остановки микрофона поток закрывается. Частоты и настройки сохраняются в `localStorage` браузера, поэтому при очистке данных сайта могут исчезнуть; используйте «Экспорт JSON».

## Файлы

- `index.html` — интерфейс.
- `styles.css` — оформление для телефона и компьютера.
- `app.js` — управление состоянием, микрофоном и измерениями.
- `dsp.js` — вычисление FFT, спектральных пиков и нот.
- `capture-worklet.js` — считывание звука в аудиопотоке браузера.
- `manifest.webmanifest`, `sw.js`, `icons/` — установка на домашний экран и офлайн-кэш.
- `tests/` — автоматические тесты синтетических частот.


## Personal kit / Worship presets (v1.1)

The default kit is **12″ rack tom, 16″ floor tom, 20″ kick, and Ludwig 14″ × 8″ snare**. Other sizes remain accessible in a separate selector group; their prior measurements are retained.

At the top of the interface choose one of three starting-point *lug-frequency* presets and click **«Применить к 4 барабанам»**. Only the top and bottom heads' target frequencies on those four drums are updated; saved readings, number of lugs, center targets, history and other drum profiles remain unchanged. Export/import JSON is still available for full backups (import replaces the existing data, so export first).

These are approximate starting points, **not** promised exact target pitches for any particular shell, drumhead or room. The 16″/snare tuning from Elevation Worship is attributed to Vincent Baynard; its 13″ tom does **not** match the owner's 12″ tom, and the adapted 12″ target is not a published Elevation Worship setting. Likewise the 20″ kick target is sourced to the tune-bot tuning table, not Elevation Worship.

Sources:
- https://tune-bot.com/tuning-guide/
- https://worshipdrummer.com/elevation-worship-drum-tuning/
- https://support.remo.com/hc/en-us/articles/360052028852-Understanding-Drumhead-types-and-differences

**Size warning:** A photographed Remo Ambassador Clear `BA-0313-00` is a 13″ head, not a 12″ head (`BA-0312-00`). On a 14″ snare, use a dedicated thin *snare-side* resonant head, not a standard Ambassador Clear tom resonant head.
