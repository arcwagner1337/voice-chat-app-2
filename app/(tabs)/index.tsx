import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import AudioTrack from 'react-native-audio-track';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';

const PORT = 5000;

export default function MeshWalkieTalkie() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [remoteIp, setRemoteIp] = useState('10.90.218.88');
  const socketRef = useRef<any>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    // 1. Настройка Плеера (Динамик/Наушники)
    // s16le, 44100Hz, Mono
    AudioTrack.init({
      sampleRate: 44100,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 3, // Playback
      bufferSize: 4096,
    });
    AudioTrack.play();

    // 2. Настройка Сети
    const socket = dgram.createSocket({ type: 'udp4' });
    socket.on('message', (msg) => {
      // ПРИЕМ: Получаем байты по Wi-Fi и суем в уши
      const base64Data = Buffer.from(msg).toString('base64');
      AudioTrack.write(base64Data);
    });
    socket.bind(PORT);
    socketRef.current = socket;

    // 3. Настройка Микрофона
    LiveAudioStream.init({
      sampleRate: 44100,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 1,
      bufferSize: 4096,
      wavFile: ""
    });

    LiveAudioStream.on('data', (data) => {
      if (!activeRef.current || !socketRef.current) return;
      const chunk = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data);
      socketRef.current.send(chunk, 0, chunk.length, PORT, remoteIp);
    });

    return () => {
      activeRef.current = false;
      LiveAudioStream.stop();
      AudioTrack.stop();
      if (socketRef.current) socketRef.current.close();
    };
  }, [remoteIp]);

  return (
    <View style={{flex: 1, backgroundColor: '#020617', padding: 40, justifyContent: 'center'}}>
      <Text style={{color: '#94a3b8', marginBottom: 5}}>IP ПАРТНЕРА:</Text>
      <TextInput 
        style={{backgroundColor: '#1e293b', color: 'white', padding: 15, borderRadius: 10, marginBottom: 20}}
        value={remoteIp}
        onChangeText={setRemoteIp}
      />
      <TouchableOpacity 
        onPress={() => {
          activeRef.current = !activeRef.current;
          setIsStreaming(activeRef.current);
          activeRef.current ? LiveAudioStream.start() : LiveAudioStream.stop();
        }}
        style={{
          height: 120, borderRadius: 30, 
          backgroundColor: isStreaming ? '#dc2626' : '#2563eb',
          alignItems: 'center', justifyContent: 'center', elevation: 5
        }}
      >
        <Text style={{color: 'white', fontWeight: 'bold', fontSize: 22}}>
          {isStreaming ? 'В ЭФИРЕ' : 'ГОВОРИТЬ'}
        </Text>
      </TouchableOpacity>
      <Text style={{color: '#4ade80', textAlign: 'center', marginTop: 20}}>
        {isStreaming ? 'Вас слышат' : 'Режим ожидания (Слушаю сеть)'}
      </Text>
    </View>
  );
}
