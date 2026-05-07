import { Stack } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform, Alert } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, RTCView } from 'react-native-webrtc';

const zeroconf = new Zeroconf();

export default function MeshChatScreen() {
  // --- СОСТОЯНИЯ ---
  const [myServiceName] = useState(`User-${Math.floor(Math.random() * 1000)}`);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [isPublished, setIsPublished] = useState(false);
  const [localStream, setLocalStream] = useState<any>(null);
  const [isEchoActive, setIsEchoActive] = useState(false);
  const isInitialized = useRef(false);

  // --- ИНИЦИАЛИЗАЦИЯ ZEROCONF ---
  useEffect(() => {
    if (isInitialized.current) return;

    zeroconf.on('start', () => setIsScanning(true));
    zeroconf.on('stop', () => setIsScanning(false));
    zeroconf.on('resolved', (service) => {
      setDevices((prev) => (prev.find((d) => d.name === service.name) ? prev : [...prev, service]));
    });
    zeroconf.on('error', (err) => console.log('Zeroconf Error:', err));
    zeroconf.on('published', () => {
      console.log("Сервис успешно опубликован!");
      setIsPublished(true);
    });

    isInitialized.current = true;
    return () => {
      try {
        zeroconf.stop();
        zeroconf.unpublishService(myServiceName);
      } catch (e) { }
      zeroconf.removeAllListeners();
      isInitialized.current = false;
    };
  }, [myServiceName]);

  // --- ФУНКЦИИ УПРАВЛЕНИЯ ---

  // Функция запроса разрешений
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        const audioGranted = granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED;
        const locationGranted = granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED;

        console.log("Разрешения:", { audioGranted, locationGranted });
        return audioGranted && locationGranted;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  };

  const toggleVisibility = async () => {
    if (isPublished) {
      try {
        zeroconf.unpublishService(myServiceName);
        setIsPublished(false);
      } catch (e) { }
    } else {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      }
      try {
        console.log("Публикация...");
        // Важно: порт числом, типы с подчеркиванием
        zeroconf.publishService('_voicechat', '_tcp', 'local.', myServiceName, 12345);
      } catch (e) {
        console.log("Ошибка публикации:", e);
      }
    }
  };

  const startDiscovery = async () => {
    setDevices([]);
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    if (!granted) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }
    try {
      zeroconf.scan('_voicechat', '_tcp', 'local.');
    } catch (e) {
      console.log("Ошибка скана:", e);
    }
  };

  const stopDiscovery = () => {
    try {
      zeroconf.stop();
    } catch (e) { }
  };

  const toggleEcho = async () => {
    if (isEchoActive) {
      localStream?.getTracks().forEach((track: any) => track.stop());
      InCallManager.stop();
      setLocalStream(null);
      setIsEchoActive(false);
    } else {
      try {
        // 1. Сначала подготавливаем почву
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          Alert.alert("Ошибка", "Разрешения не получены");
          return;
        }


        // 2. Включаем InCallManager ДО микрофона
        InCallManager.start({ media: 'audio', ringback: '' });
        InCallManager.setForceSpeakerphoneOn(true);

        // 3. Небольшая задержка, чтобы система переключила режим
        await new Promise(resolve => setTimeout(resolve, 500));

        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });

        setLocalStream(stream);
        setIsEchoActive(true);
      } catch (err: any) {
        Alert.alert("Ошибка", err.message);
      }
    }
  };


  // --- ВЕРСТКА ---
  return (
    <>
      <Stack.Screen options={{ title: 'Mesh Voice Chat' }} />

      <View className="flex-1 bg-emerald-900 p-6">
        <View className="mb-6 items-center">
          <Text className="text-emerald-300 font-bold mb-2">Ваше имя: {myServiceName}</Text>
          {isEchoActive && (
            <View className="flex-row items-center">
              <View className="w-2 h-2 bg-red-500 rounded-full mr-2" />
              <Text className="text-red-400 font-bold">МИКРОФОН ВКЛЮЧЕН</Text>
              <RTCView streamURL={localStream?.toURL()} style={{ width: 0, height: 0 }} />
            </View>
          )}
        </View>

        <Text className="text-white text-xl font-bold mb-4">Устройства рядом:</Text>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.name}
          className="flex-1"
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-emerald-700 p-4 rounded-2xl mb-3 border border-emerald-500"
              onPress={() => Alert.alert("Подключение", `IP: ${item.addresses?.[0]}`)}
            >
              <Text className="text-white font-bold text-lg">{item.name}</Text>
              <Text className="text-emerald-300 text-xs">{item.addresses?.[0] || 'Получение IP...'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="p-10 border-2 border-dashed border-emerald-700 rounded-2xl">
              <Text className="text-emerald-500 text-center italic">
                {isScanning ? 'Ищем соседей...' : 'Никого нет'}
              </Text>
            </View>
          }
        />

        <View className="space-y-3 mt-4">
          <TouchableOpacity
            onPress={toggleEcho}
            className={`p-4 rounded-2xl items-center ${isEchoActive ? 'bg-red-600' : 'bg-blue-600'}`}
          >
            <Text className="text-white font-bold">
              {isEchoActive ? 'ВЫКЛЮЧИТЬ ЭХО' : 'ПРОВЕРИТЬ ГОЛОС'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleVisibility}
            className={`p-4 rounded-2xl items-center ${isPublished ? 'bg-emerald-500' : 'bg-gray-600'}`}
          >
            <Text className="text-white font-bold">
              {isPublished ? 'ВЫ ВИДИМЫ В СЕТИ' : 'СТАТЬ ВИДИМЫМ'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={isScanning ? stopDiscovery : startDiscovery}
            className={`p-4 rounded-2xl items-center border border-emerald-400`}
          >
            <Text className="text-emerald-400 font-bold">
              {isScanning ? 'ОСТАНОВИТЬ ПОИСК' : 'НАЙТИ СОСЕДЕЙ'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
