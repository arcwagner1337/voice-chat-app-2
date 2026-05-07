import { Stack } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, Alert } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, RTCView } from 'react-native-webrtc';

const zeroconf = new Zeroconf();
const SERVICE_TYPE = 'voicechat';

export default function MeshChatScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [localStream, setLocalStream] = useState<any>(null);
  const [isEchoActive, setIsEchoActive] = useState(false);
  const [myServiceName, setMyServiceName] = useState(`User-${Math.floor(Math.random() * 1000)}`);

  // Запрос разрешений
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, // Нужно для Zeroconf на Android
        ]);
        return (
          granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } catch (err) {
        return false;
      }
    }
    return true;
  };

  // Эхо-тест (Локальная проверка)
  const toggleEcho = async () => {
    if (isEchoActive) {
      localStream?.getTracks().forEach((track: any) => track.stop());
      InCallManager.stop();
      setLocalStream(null);
      setIsEchoActive(false);
    } else {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        Alert.alert("Ошибка", "Нужны разрешения на микрофон и геолокацию (для поиска Wi-Fi устройств)");
        return;
      }

      try {
        InCallManager.start({ media: 'audio' });

        // Даем нативному слою 500мс "прогреться"
        await new Promise(resolve => setTimeout(resolve, 500));

        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        // Настройка звука
        InCallManager.start({ media: 'audio' });
        InCallManager.setForceSpeakerphoneOn(true);

        console.log("Track ID:", stream.getAudioTracks()[0]?.id);

        setLocalStream(stream);
        setIsEchoActive(true);
      } catch (err: any) {
        Alert.alert("Ошибка микрофона", err.message);
      }
    }
  };

  // Управление Zeroconf (Поиск и Видимость)
  useEffect(() => {
    // 1. Слушатели поиска
    zeroconf.on('start', () => setIsScanning(true));
    zeroconf.on('stop', () => setIsScanning(false));
    zeroconf.on('resolved', (service) => {
      // Не добавляем самих себя в список
      if (service.name !== myServiceName) {
        setDevices((prev) => {
          if (prev.find(d => d.name === service.name)) return prev;
          return [...prev, service];
        });
      }
    });

    zeroconf.on('error', (err) => console.log('Zeroconf Error:', err));

    // 2. СТАТЬ ВИДИМЫМ (Объявить о себе в сети)
    try {
      console.log("Публикация сервиса:", myServiceName);
      // Добавляем нижнее подчеркивание и приводим порт к строке
      zeroconf.publishService('_voicechat', '_tcp', 'local.', myServiceName, 12345);
    } catch (e) {
      console.log("Ошибка публикации:", e);
    }

    return () => {
      zeroconf.stop();
      try {
        zeroconf.publishService('_voicechat', '_tcp', 'local.', myServiceName, 12345);
      } catch (e) { }
      zeroconf.removeAllListeners();
    };
  }, [myServiceName]);

  const startDiscovery = () => {
    setDevices([]);
    // Важно: _voicechat и _tcp
    zeroconf.scan('_voicechat', '_tcp', 'local.');
  };

  const stopDiscovery = () => {
    zeroconf.stop();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Mesh Voice Chat' }} />

      <View className="flex-1 bg-emerald-900 p-6">

        {/* Индикатор работы */}
        <View className="mb-6 items-center">
          <Text className="text-emerald-300 font-bold">Ваше имя: {myServiceName}</Text>
          {isEchoActive && (
            <View className="flex-row items-center mt-2">
              <View className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2" />
              <Text className="text-red-400 font-bold">МИКРОФОН АКТИВЕН</Text>
              <RTCView streamURL={localStream?.toURL()} style={{ width: 0, height: 0 }} />
            </View>
          )}
        </View>

        {/* Список соседей */}
        <Text className="text-white text-xl font-bold mb-4">Устройства рядом:</Text>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-emerald-700 p-4 rounded-2xl mb-3 border border-emerald-500"
              onPress={() => Alert.alert("Подключение", `Вызываем ${item.name} по адресу ${item.addresses[0]}`)}
            >
              <Text className="text-white font-bold text-lg">{item.name}</Text>
              <Text className="text-emerald-300 text-xs">{item.addresses[0] || 'Получение IP...'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="p-10 border-2 border-dashed border-emerald-700 rounded-2xl">
              <Text className="text-emerald-500 text-center italic">
                {isScanning ? 'Ищем соседей...' : 'Никого нет. Нажми "Поиск"'}
              </Text>
            </View>
          }
        />

        {/* Кнопки управления */}
        <View className="mt-6 space-y-3">
          <TouchableOpacity
            onPress={toggleEcho}
            className={`p-4 rounded-2xl items-center shadow-lg ${isEchoActive ? 'bg-red-600' : 'bg-blue-600'}`}
          >
            <Text className="text-white font-bold">
              {isEchoActive ? 'ВЫКЛЮЧИТЬ МИКРОФОН' : 'ПРОВЕРИТЬ СВОЙ ГОЛОС'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isScanning ? stopDiscovery : startDiscovery}
            className={`p-4 rounded-2xl items-center border-2 ${isScanning ? 'border-red-500' : 'border-emerald-400 bg-emerald-800'}`}
          >
            <Text className={isScanning ? 'text-red-500 font-bold' : 'text-emerald-400 font-bold'}>
              {isScanning ? 'ОСТАНОВИТЬ ПОИСК' : 'НАЙТИ СОСЕДЕЙ'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
