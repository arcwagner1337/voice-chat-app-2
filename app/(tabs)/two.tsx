import { Stack } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import { mediaDevices, RTCView } from 'react-native-webrtc';

const zeroconf = new Zeroconf();

export default function MeshChatScreen() {
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [localStream, setLocalStream] = useState<any>(null);

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
        <Text className="text-white text-2xl font-bold mb-4">Локальные соседи</Text>

        {/* Список найденных устройств */}
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
