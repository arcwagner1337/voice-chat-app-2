import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native';
import { Audio } from 'expo-av';
import { ScreenContent } from '../../components/ScreenContent';

export default function Home() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [soundUri, setSoundUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // --- ЛОГИКА ТЕСТА ---
  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Ошибка', 'Нет прав на микрофон');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      
      setRecording(recording);
      setIsRecording(true);
      console.log('Запись началась');
    } catch (err) {
      console.error('Не удалось начать запись', err);
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setSoundUri(uri);
    setRecording(null);
    console.log('Запись сохранена в:', uri);
  }

  async function playSound() {
    if (!soundUri) return;
    const { sound } = await Audio.Sound.createAsync({ uri: soundUri });
    await sound.playAsync();
  }

  // --- ВЕРСТКА ---
  return (
    <>
      <Stack.Screen options={{ title: 'Mic Test' }} />
      <View className="flex-1 items-center justify-center bg-orange-500 p-6">
        <Text className="text-white text-2xl font-bold mb-6">Проверка железа</Text>
        
        {/* Кнопка Записи */}
        <TouchableOpacity 
          onPress={isRecording ? stopRecording : startRecording}
          className={`w-full p-6 rounded-2xl mb-4 items-center ${isRecording ? 'bg-red-600' : 'bg-black'}`}
        >
          <Text className="text-white font-bold text-lg">
            {isRecording ? '⏹ ОСТАНОВИТЬ ЗАПИСЬ' : '🎤 НАЧАТЬ ЗАПИСЬ'}
          </Text>
        </TouchableOpacity>

        {/* Кнопка Воспроизведения */}
        {soundUri && !isRecording && (
          <TouchableOpacity 
            onPress={playSound}
            className="w-full p-6 rounded-2xl bg-white items-center"
          >
            <Text className="text-orange-500 font-bold text-lg">▶ ПРОСЛУШАТЬ СЕБЯ</Text>
          </TouchableOpacity>
        )}

        <View className="mt-10 opacity-20">
          <ScreenContent path="app/(tabs)/index.tsx" title="Tab One" />
        </View>
      </View>
    </>
  );
}
