import { Stack } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, Platform, PermissionsAndroid, TextInput, ScrollView } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCView } from 'react-native-webrtc';
import TcpSocket from 'react-native-tcp-socket';
import { useKeepAwake } from 'expo-keep-awake';

const zeroconf = new Zeroconf();
let isSending = false;
let signalQueue: { ip: string; data: any; port: number }[] = [];

export default function MeshChatRoom() {
  useKeepAwake();

  const [userName, setUserName] = useState(`Пользователь-${Math.floor(Math.random() * 99)}`);
  const [myIp, setMyIp] = useState<string>('');
  const [roomName, setRoomName] = useState(`Комната-${Math.floor(Math.random() * 99)}`);
  const [roomPort, setRoomPort] = useState('12345');
  const [myServiceName] = useState(`User-${Math.floor(Math.random() * 9999)}`);
  const [isHost, setIsHost] = useState(false);
  const [inRoom, setInRoom] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [participants, setParticipants] = useState<{ ip: string, name: string, isMe: boolean }[]>([]);

  const peers = useRef<{ [key: string]: RTCPeerConnection }>({});
  const remoteStreams = useRef<{ [key: string]: any }>({});
  const peerNames = useRef<{ [key: string]: string }>({});

  const localStream = useRef<any>(null);
  const server = useRef<any>(null);
  const activePort = useRef<number>(12345);

  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [inputPass, setInputPass] = useState('');

  useEffect(() => {
    initApp();
    const timer = setInterval(() => {
      setAvailableRooms(prev => prev.filter(r => Date.now() - r.lastSeen < 15000));
    }, 5000);
    return () => { clearInterval(timer); stopAll(); };
  }, []);

  const initApp = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    localStream.current = stream;
    setupDiscovery();
  };

  const setupDiscovery = () => {
    zeroconf.stop();
    zeroconf.on('resolved', (s) => {
      const ip = s.addresses?.find(a => a.includes('.') && !a.startsWith('169'));
      if (s.name === myServiceName) {
        if (ip) setMyIp(ip);
      } else if (ip && ip !== myIp && s.txt?.isRoom === 'true') {
        setAvailableRooms(prev => {
          const otherRooms = prev.filter(r => r.ip !== ip);
          return [...otherRooms, {
            name: s.txt?.roomName || s.name,
            ip,
            port: s.port,
            lastSeen: Date.now()
          }];
        });
      }
    });
    zeroconf.publishService('voicechat', 'tcp', 'local.', myServiceName, 11111);
    setTimeout(() => { if (!isHost) zeroconf.unpublishService(myServiceName); }, 3000);
    zeroconf.scan('voicechat', 'tcp', 'local.');
  };

  const createRoom = async () => {
    if (!myIp || myIp.length < 7) return Alert.alert("Ошибка", "IP не определен");
    if (!roomName) return Alert.alert("Ошибка", "Введите название");
    const port = parseInt(roomPort);
    activePort.current = port;
    setupTcpServer(port);
    InCallManager.start({ media: 'audio' });
    InCallManager.setForceSpeakerphoneOn(true);
    zeroconf.publishService('voicechat', 'tcp', 'local.', myServiceName, port, { roomName, isRoom: 'true' });
    setIsHost(true);
    setInRoom(true);
  };

  const joinRoom = async (room: any) => {
    if (parseInt(inputPass) !== room.port) return Alert.alert("Ошибка", "Неверный пароль");
    activePort.current = room.port;
    setupTcpServer(room.port);
    InCallManager.start({ media: 'audio' });
    InCallManager.setForceSpeakerphoneOn(true);
    const pc = getOrCreatePeer(room.ip);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignaling(room.ip, { type: 'offer', offer, name: userName }, room.port);
    setInRoom(true);
  };

  const getOrCreatePeer = (remoteIp: string) => {
    if (peers.current[remoteIp]) return peers.current[remoteIp];
    const pc = new RTCPeerConnection({ iceServers: [] });
    const pcAny = pc as any;
    pcAny.onicecandidate = (e: any) => {
      if (e.candidate) sendSignaling(remoteIp, { type: 'ice', candidate: e.candidate }, activePort.current);
    };
    pcAny.ontrack = (e: any) => {
      if (e.streams && e.streams[0]) {
        remoteStreams.current[remoteIp] = e.streams[0];
        updateParticipantsList();
      }
    };
    localStream.current?.getTracks().forEach((t: any) => pc.addTrack(t, localStream.current));
    peers.current[remoteIp] = pc;
    return pc;
  };

  const updateParticipantsList = () => {
    const list = Object.keys(remoteStreams.current).map(ip => ({
      ip,
      name: peerNames.current[ip] || 'Участник',
      isMe: false
    }));
    setParticipants(list);
  };

  const setupTcpServer = (port: number) => {
    if (server.current) server.current.close();
    server.current = TcpSocket.createServer((socket) => {
      socket.on('data', async (data) => {
        try {
          const msg = JSON.parse(data.toString());

          // ЛОГИКА ВЫХОДА ИЗ КОМНАТЫ
          if (msg.type === 'room_closed') {
            Alert.alert("Завершено", "Админ удалил комнату");
            return stopAll();
          }
          if (msg.type === 'bye') return closePeer(msg.fromIp);

          if (msg.name) {
            peerNames.current[msg.fromIp] = msg.name;
            updateParticipantsList();
          }
          const pc = getOrCreatePeer(msg.fromIp);
          if (msg.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignaling(msg.fromIp, { type: 'answer', answer, name: userName }, activePort.current);
          } else if (msg.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.answer));
          } else if (msg.type === 'ice') {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => { });
          }
        } catch (e) { }
      });
    }).listen({ port: port, host: '0.0.0.0' });
  };

  const sendSignaling = (ip: string, data: any, port: number) => {
    if (!ip || ip === '0.0.0.0') return;
    signalQueue.push({ ip, data, port });
    if (!isSending) processQueue();
  };

  const processQueue = async () => {
    if (signalQueue.length === 0) { isSending = false; return; }
    isSending = true;
    const item = signalQueue.shift();
    if (!item) return;
    let client: any = TcpSocket.createConnection({ port: item.port, host: item.ip }, () => {
      client.write(JSON.stringify({ ...item.data, fromIp: myIp }), 'utf8', () => client.destroy());
    });
    client.on('error', () => client?.destroy());
    client.on('close', () => { client = null; setTimeout(processQueue, 300); });
  };

  const closePeer = (ip: string) => {
    if (peers.current[ip]) {
      peers.current[ip].close();
      delete peers.current[ip];
      delete remoteStreams.current[ip];
      delete peerNames.current[ip];
      updateParticipantsList();
    }
  };

  const stopAll = () => {
    // РАССЫЛКА СИГНАЛА ЗАКРЫТИЯ (Если хост - закрываем у всех)
    const exitSignal = isHost ? 'room_closed' : 'bye';
    Object.keys(peers.current).forEach(ip => sendSignaling(ip, { type: exitSignal }, activePort.current));

    setTimeout(() => {
      Object.values(peers.current).forEach(p => p.close());
      peers.current = {};
      remoteStreams.current = {};
      peerNames.current = {};
      setParticipants([]);
      setIsHost(false);
      setInRoom(false);
      InCallManager.stop();
      zeroconf.stop();
      if (server.current) server.current.close();
      setupDiscovery();
    }, 400);
  };

  return (
    <View className="flex-1 bg-slate-950 p-5">
      <Stack.Screen options={{ headerShown: false }} />
      {!inRoom ? (
        <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
          {/* ПРОФИЛЬ */}
          <View className="mt-10 p-4 bg-slate-900 rounded-2xl border border-slate-800">
            <Text className="text-slate-500 text-[10px] mb-1">ВАШ ПРОФИЛЬ:</Text>
            <TextInput
              placeholder="Ваше имя"
              placeholderTextColor="#334155"
              className="text-white font-bold text-lg border-b border-slate-800 pb-1"
              value={userName}
              onChangeText={setUserName}
            />
            <View className="flex-row mt-2 items-center">
              <Text className="text-slate-500 text-xs">IP: </Text>
              <TextInput
                value={myIp}
                onChangeText={setMyIp}
                className="text-slate-400 text-xs flex-1"
                placeholder="192.168.1.X"
                placeholderTextColor="#334155"
              />
            </View>
          </View>

          {/* СОЗДАНИЕ КОМНАТЫ */}
          <View className="bg-slate-900 p-4 rounded-2xl mt-5 border border-slate-800">
            <TextInput
              placeholder="Имя комнаты"
              placeholderTextColor="#475569"
              className="text-white border-b border-slate-800 mb-2 p-1"
              value={roomName}
              onChangeText={setRoomName}
            />
            <TextInput
              placeholder="Пароль (Порт)"
              placeholderTextColor="#475569"
              keyboardType="numeric"
              className="text-white p-1"
              value={roomPort}
              onChangeText={setRoomPort}
            />
            <TouchableOpacity
              onPress={createRoom}
              className="bg-cyan-600 p-4 rounded-xl mt-2"
            >
              <Text className="text-white text-center font-bold uppercase tracking-wider">Создать</Text>
            </TouchableOpacity>
          </View>

          <Text className="text-white font-bold mt-5 mb-2">ДОСТУПНЫЕ КОМНАТЫ:</Text>
          <FlatList
            scrollEnabled={false}
            data={availableRooms}
            keyExtractor={item => item.ip}
            renderItem={({ item }) => (
              <View className={`bg-slate-900 p-4 mt-2 rounded-2xl border ${selectedRoom?.ip === item.ip ? 'border-cyan-600' : 'border-slate-800'}`}>
                <TouchableOpacity onPress={() => { setSelectedRoom(item); setInputPass(''); }}>
                  <Text className="text-white font-bold text-base">🏠 {item.name}</Text>
                  <Text className="text-slate-500 text-xs">Хост: {item.ip}</Text>
                </TouchableOpacity>

                {selectedRoom?.ip === item.ip && (
                  <View className="mt-3 border-t border-slate-800 pt-3">
                    <TextInput
                      placeholder="Пароль"
                      placeholderTextColor="#475569"
                      keyboardType="numeric"
                      className="text-white bg-slate-950 p-2 rounded-lg mb-2"
                      value={inputPass}
                      onChangeText={setInputPass}
                    />
                    <TouchableOpacity
                      onPress={() => joinRoom(item)}
                      className="bg-green-500 p-3 rounded-lg"
                    >
                      <Text className="text-white text-center font-bold">ВОЙТИ</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          />
        </ScrollView>
      ) : (
        /* В КОМНАТЕ */
        <View className="flex-1 justify-center items-center mt-6">
          <Text className="text-green-500 text-2xl font-bold">{isHost ? 'Хост: ' + roomName : 'В КОМНАТЕ: ' + roomName}</Text>
          <Text className="text-cyan-400 font-medium mb-5">ПАРОЛЬ: {activePort.current}</Text>

          <FlatList
            data={[{ ip: myIp || '0.0.0.0', name: userName, isMe: true }, ...participants]}
            keyExtractor={item => item.ip}
            className="w-full mt-5"
            renderItem={({ item }) => (
              <View className={`p-4 bg-slate-900 rounded-xl mb-2 border ${item.isMe ? 'border-green-500' : 'border-transparent'}`}>
                <Text className={`font-bold ${item.isMe ? 'text-green-500' : 'text-white'}`}>
                  🎤 {item.name} {item.isMe ? '(Вы)' : ''}
                </Text>
                <Text className="text-slate-500 text-[10px]">IP: {item.ip}</Text>
              </View>
            )}
          />

          <TouchableOpacity
            onPress={stopAll}
            className="bg-red-950 p-5 rounded-2xl w-full mt-auto"
          >
            <Text className="text-red-500 text-center font-bold uppercase">Выйти</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ФОНОВЫЕ СТРИМЫ */}
      <View className="absolute bottom-0 opacity-0 w-px h-px">
        {localStream.current && <RTCView streamURL={localStream.current.toURL()} style={{ width: 1, height: 1 }} />}
        {Object.keys(remoteStreams.current).map(ip => {
          const stream = remoteStreams.current[ip];
          if (!stream || typeof stream.toURL !== 'function') return null;
          return <RTCView key={ip} streamURL={stream.toURL()} style={{ width: 1, height: 1 }} />;
        })}
      </View>
    </View>
  );

}
