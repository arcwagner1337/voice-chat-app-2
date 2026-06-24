// const { withAndroidManifest } = require('@expo/config-plugins');

// module.exports = function withNotifeeMicFix(config) {
//   return withAndroidManifest(config, (config) => {
//     const androidManifest = config.modResults;
//     const mainApplication = androidManifest.manifest.application;

//     if (mainApplication && mainApplication.service) {
//       // Ищем внутренний сервис Notifee в манифесте
//       const notifeeService = mainApplication.service.find(
//         (s) => s.$['android:name'] === 'app.notifee.core.ForegroundService'
//       );

//       if (notifeeService) {
//         // Принудительно выставляем тип microphone и добавляем замену
//         notifeeService.$['android:foregroundServiceType'] = 'microphone';
//         notifeeService.$['tools:replace'] = 'android:foregroundServiceType';
//       } else {
//         // Если Notifee еще не добавил сервис, регистрируем его вручную
//         mainApplication.service.push({
//           $: {
//             'android:name': 'app.notifee.core.ForegroundService',
//             'android:foregroundServiceType': 'microphone',
//             'android:exported': 'false',
//             'tools:replace': 'android:foregroundServiceType'
//           },
//         });
//       }
//     }

//     // Добавляем пространство имен tools в тег <manifest>, если его нет
//     if (!androidManifest.manifest.$['xmlns:tools']) {
//       androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
//     }

//     return config;
//   });
// };

const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withNotifeeMicFix(config) {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    const mainApplication = androidManifest.manifest.application;

    // Комбинируем типы сервиса для Android 14/15
    // microphone — для Notifee, phoneCall — для нативного тракта WebRTC/InCallManager
    const targetServiceType = 'microphone|phoneCall';

    if (mainApplication && mainApplication.service) {
      const notifeeService = mainApplication.service.find(
        (s) => s.$['android:name'] === 'app.notifee.core.ForegroundService'
      );

      if (notifeeService) {
        notifeeService.$['android:foregroundServiceType'] = targetServiceType;
        notifeeService.$['tools:replace'] = 'android:foregroundServiceType';
      } else {
        mainApplication.service.push({
          $: {
            'android:name': 'app.notifee.core.ForegroundService',
            'android:foregroundServiceType': targetServiceType,
            'android:exported': 'false',
            'tools:replace': 'android:foregroundServiceType'
          },
        });
      }
    }

    if (!androidManifest.manifest.$['xmlns:tools']) {
      androidManifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
};
