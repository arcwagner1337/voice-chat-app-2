# 🏍️ Moto Intercom (Offline Voice Chat)

Голосовой чат (рация) для байкеров на React Native (Expo). Работает в локальной сети (Wi-Fi Hotspot) без интернета и бэкенда. Идеально для поездок в группе, где нет мобильной связи.

## 🚀 Стек технологий
- **Framework:** Expo (Router) + Development Builds
- **Voice:** [React Native WebRTC](https://github.com) (с шумоподавлением и эхоподавлением)
- **Discovery:** [Zeroconf](https://github.com) (автопоиск устройств в сети)
- **Signaling:** [UDP](https://github.com) (прямой обмен данными между телефонами)
- **Styling:** NativeWind (Tailwind CSS)
- **Package Manager:** Bun

## 🛠️ Предварительные требования
Для работы приложения **необходима** нативная сборка, так как используются модули микрофона и сети.
1. Установленный [Bun](https://bun.sh).
2. Настроенное окружение для Android (Android Studio) или iOS (Xcode).
3. **Реальные устройства** (на эмуляторах проверить локальную сеть и микрофон шлема полноценно не получится).

## 📦 Установка и запуск

1. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com
   cd voice-chat-app
   ```

2. **Установите зависимости:**
   ```bash
   bun install
   ```

3. **Запустите генерацию нативных файлов:**
   *Команда создаст папки /android и /ios с необходимыми разрешениями.*
   ```bash
   npx expo prebuild
   ```

4. **Запуск приложения (Development Build):**

   **Для Android:**
   ```bash
   bun run build:android
   ```

   **Для iOS:**
   ```bash
   bun run build:ios
   ```

## 📶 Как пользоваться в дороге (Offline)

Приложение работает по принципу локального сервера:

1. **Создание сети:** Один участник (Лидер) включает **Точку доступа (Hotspot)** на своем телефоне.
2. **Подключение:** Все остальные участники подключаются к этому Wi-Fi. Интернет не требуется.
3. **Связь:** Откройте приложение, перейдите во вкладку **Info**. 
4. **Автопоиск:** Устройства автоматически найдут друг друга и установят WebRTC-соединение.
5. **PTT:** Зажмите центральную кнопку, чтобы говорить. Отпустите, чтобы слушать.

## ⚠️ Важные нюансы
- **Expo Go:** Приложение **не будет работать** в обычном Expo Go. Только через `npx expo run`.
- **Энергопотребление:** Рекомендуется держать телефон на зарядке во время поездки, так как Wi-Fi Hotspot и WebRTC активно потребляют заряд.
- **Дистанция:** Связь ограничена радиусом действия Wi-Fi (обычно 30-50 метров в прямой видимости).

## 📜 Лицензия
MIT — для личного пользования.



npm install react-native-udp react-native-live-audio-stream buffer

https://www.google.com/search?q=react+native+%D0%B1%D0%B8%D0%B1%D0%BB%D0%B8%D0%BE%D1%82%D0%B5%D0%BA%D0%B0+%D0%B4%D0%BB%D1%8F+%D0%B3%D0%BE%D0%BB%D0%BE%D1%81%D0%BE%D0%B2%D0%BE%D0%B3%D0%BE+%D1%87%D0%B0%D1%82%D0%B0+%D0%BF%D0%BE+%D0%BB%D0%BE%D0%BA%D0%B0%D0%BB%D1%8C%D0%BD%D0%BE%D0%B9+%D1%81%D0%B5%D1%82%D0%B8&gs_lcrp=EgZjaHJvbWUyCwgAEEUYChg5GKABMgkIARAhGAoYoAHSAQkxOTE4MGowajmoAg6wAgHxBZgUfdCzlIcI8QWYFH3Qs5SHCA&client=ms-android-samsung-ss&sourceid=chrome-mobile&ie=UTF-8&udm=50&fbs=ADc_l-bs2zYa4_vOddERTHH0rF8CDbOPXIO2Jmt3O1q1mG8sqIBodZU9EysgsK8u7QK6IWDOptN89aOQj40J5PwHNgDxoMwPOlM4YRGOS6sBFB0xNiWcJvUB9-984xVL_FDQJZMzwVuMMVdUmLm4_ytgIX8K0XjgtAjEWZmArpwSN1edSe-6XWT6DtruYUiIxSLLxS14rVxgzyc3HdOoTsnkDnzX6VEiqcb_m1m-eg7T96Y6D1cfe8VzDXcaNtyNN5MUGiSr63j-vxQ43gcbH4i3ctYDR5M88w&aep=10&ntc=1&mstk=AUtExfBZM8CeuFQp4CW_K-7YkG_T8rhbKSF7uNtoOpVep77RkCshFrpC6sgXULel4h_d92doyCxaBmru1cW5fvZBfppqL0Hb5oNt-Ij20rbQCRpBdJFnNPvyffEVlhHyHl4U8DpXIpm1uLGDbNEQ5uc5UfI1hr4sAtDzv2J5ixHrja4hbj58xnX-4yGirE60dXzm9Nu1hF0G_J4T02HoIYCLH4xhJKg8M8s8Dm2DffZSW3aoQ_OLs-fuPfeNYJHsmKruske_WSKKCArO4rFiJ4YsHRcAZt9LiyUg0T28Gv_BFJ_gQJKE_touEmw3wcBeKebgM1oJC5HboDBGoQ&csuir=1&aioh=3&mtid=9Gz8adz0Orah1fIP16i6kAM&lns_mode=cvst#lfId=ChxjMe
