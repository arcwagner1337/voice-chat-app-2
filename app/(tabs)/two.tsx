import { Stack } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, PermissionsAndroid, Platform } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import { mediaDevices, RTCView } from 'react-native-webrtc';

const zeroconf = new Zeroconf();

export default function MeshChatScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [localStream, setLocalStream] = useState<any>(null);
  const [isEchoActive, setIsEchoActive] = useState(false);
  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Разрешение на микрофон",
          message: "Приложению нужен доступ к микрофону для чата",
          buttonNeutral: "Позже",
          buttonNegative: "Отмена",
          buttonPositive: "ОК"
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  };
  const toggleEcho = async () => {
    if (isEchoActive) {
      localStream?.getTracks().forEach((track: any) => track.stop());
      setLocalStream(null);
      setIsEchoActive(false);
    } else {
      // 1. СНАЧАЛА СПРАШИВАЕМ РАЗРЕШЕНИЕ
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        alert("Без разрешения на микрофон ничего не заработает!");
        return;
      }

      try {
        const check = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        alert("Манифест разрешает микрофон?: " + check);

        const stream = await mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false, // Отключи для теста, чтобы исключить программное глушение
            noiseSuppression: false,
            autoGainControl: false
          } as any,
          video: false,
        });
        console.log(stream)
        setLocalStream(stream);
        setIsEchoActive(true);
      } catch (err: any) {
        alert("ОШИБКА: " + err.message); // Выведет точную причину (например, Permission Denied или Device Found)
        console.log(err);
      }
    }
  };


  useEffect(() => {
    // Слушатели событий поиска
    zeroconf.on('start', () => setIsScanning(true));
    zeroconf.on('stop', () => setIsScanning(false));
    zeroconf.on('resolved', (service: any) => {
      setDevices((prev) => [...prev, service]);
    });

    return () => {
      zeroconf.stop();
      zeroconf.removeAllListeners();
    };
  }, []);

  const startLocalAudio = async () => {
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    setLocalStream(stream);
  };

  const startDiscovery = () => {
    setDevices([]);
    // Ищем только наш тип сервиса (назовем его _voicechat)
    zeroconf.scan('voicechat', 'tcp', 'local.');
  };

  const stopDiscovery = () => {
    zeroconf.stop();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Mesh Voice' }} />

      <View className="flex-1 bg-emerald-900 p-6">
        {isEchoActive && (
          <View className="items-center mb-4">
            <Text className="text-red-400 animate-pulse font-bold">● ИДЕТ ЗАПИСЬ И ВОСПРОИЗВЕДЕНИЕ</Text>
            {/* 
               Для аудио RTCView не обязателен, но он помогает 
               управлять потоком. Главное — включить динамик.
            */}
            <RTCView
              streamURL={localStream?.toURL()}
              style={{ width: 0, height: 0 }} // Скрываем, так как видео нет
            />
          </View>
        )}


        {/* Список найденных устройств */}
        <Text className="text-white text-2xl font-bold mb-4">Локальные соседи</Text>

        <FlatList
          data={devices}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-emerald-700 p-4 rounded-xl mb-2"
              onPress={() => console.log('Подключение к:', item.addresses[0])}
            >
              <Text className="text-white font-semibold">{item.name}</Text>
              <Text className="text-emerald-300 text-xs">{item.addresses[0]}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text className="text-emerald-400 italic">Никого не найдено. Нажми "Поиск"</Text>
          }
        />
        <TouchableOpacity
          onPress={toggleEcho}
          className={`p-4 rounded-2xl items-center ${isEchoActive ? 'bg-red-500' : 'bg-blue-500'}`}
        >
          <Text className="text-white font-bold text-center">
            {isEchoActive ? 'ВЫКЛЮЧИТЬ ЭХО' : 'ПРОВЕРИТЬ ГОЛОС (ЭХО)'}
          </Text>
        </TouchableOpacity>
        {/* Панель управления */}
        <View className="mt-auto space-y-3">
          <TouchableOpacity
            onPress={isScanning ? stopDiscovery : startDiscovery}
            className={`p-4 rounded-2xl items-center ${isScanning ? 'bg-red-500' : 'bg-emerald-500'}`}
          >
            <Text className="text-white font-bold">
              {isScanning ? 'ОСТАНОВИТЬ ПОИСК' : 'НАЙТИ СОСЕДЕЙ'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={startLocalAudio}
            className="p-4 bg-white/10 border border-emerald-400 rounded-2xl items-center"
          >
            <Text className="text-emerald-400 font-bold">ПРОВЕРИТЬ МИКРОФОН</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
}
