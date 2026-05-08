import { Stack } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert, TextInput } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCView } from 'react-native-webrtc';
import TcpSocket from 'react-native-tcp-socket';
import dgram from 'react-native-udp';
import { Buffer } from 'buffer';
import LiveAudioStream from 'react-native-live-audio-stream';

const zeroconf = new Zeroconf();
const TCP_PORT = 12345;
const LAPTOP_IP = '10.90.218.88'; // Твой IP ноута
const UDP_PORT = 5000;

export default function MeshChatScreen() {
  const [myServiceName] = useState(`User-${Math.floor(Math.random() * 1000)}`);
  const [devices, setDevices] = useState<any[]>([]);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [isUdpStreaming, setIsUdpStreaming] = useState(false);

  const peerConn = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<any>(null);
  const iceQueue = useRef<any[]>([]);
  const server = useRef<any>(null);

  const [laptopIp, setLaptopIp] = useState('10.90.218.88');
  const [udpPort, setUdpPort] = useState('5000');
  const [tcpPort, setTcpPort] = useState('12345');

  const udpSocket = useRef<any>(null);
  const activeUdpRef = useRef(false);

  useEffect(() => {
    // 1. Инициализация UDP сокета для трансляции на ноут
    const s = dgram.createSocket({ type: 'udp4' });
    s.bind();
    udpSocket.current = s;

    // 2. Настройка захвата сырого звука (как в первом тесте)
    LiveAudioStream.init({
      sampleRate: 44100,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 1,
      bufferSize: 4096,
      wavFile: ""
    });

    LiveAudioStream.on('data', (data: any) => {
      if (!activeUdpRef.current || !udpSocket.current) return;
      try {
        const chunk = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.from(data);
        udpSocket.current.send(chunk, 0, chunk.length, UDP_PORT, LAPTOP_IP, (err: any) => {
          if (err) console.log("UDP Send Error");
        });
      } catch (e) { }
    });

    setupTcpServer();

    zeroconf.on('resolved', (service) => {
      if (service.name !== myServiceName) {
        setDevices((prev) => prev.find(d => d.name === service.name) ? prev : [...prev, service]);
      }
    });

    return () => {
      stopAll();
    };
  }, []);

  const setupTcpServer = () => {
    server.current = TcpSocket.createServer((socket) => {
      socket.on('data', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'offer') await handleOffer(msg.offer, msg.fromIp);
          if (msg.type === 'answer') {
            await peerConn.current?.setRemoteDescription(new RTCSessionDescription(msg.answer));
            processIceQueue();
          }
          if (msg.type === 'ice') {
            if (peerConn.current?.remoteDescription) {
              await peerConn.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } else {
              iceQueue.current.push(msg.candidate);
            }
          }
        } catch (e) { console.log("Signaling Err:", e); }
      });
    }).listen({ port: TCP_PORT, host: '0.0.0.0' });
  };

  const sendSignaling = (ip: string, data: any) => {
    try {
      const client = TcpSocket.createConnection({ port: TCP_PORT, host: ip }, () => {
        client.write(JSON.stringify(data));
      });
      client.on('error', (err) => console.log("TCP Signal Err:", err.message));
    } catch (e) { console.log("Signaling Crash Prevented"); }
  };


  const setupPeer = async (remoteIp?: string) => {
    try {
      if (peerConn.current) peerConn.current.close();
      peerConn.current = new RTCPeerConnection({ iceServers: [] });
      const pc = peerConn.current as any;

      pc.onicecandidate = (event: any) => {
        if (event.candidate && remoteIp) {
          sendSignaling(remoteIp, { type: 'ice', candidate: event.candidate });
        }
      };

      pc.ontrack = (event: any) => {
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
          InCallManager.start({ media: 'audio' });
          InCallManager.setForceSpeakerphoneOn(true);
        }
      };

      const stream = await mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true } as any,
        video: false
      });

      localStream.current = stream;
      stream.getTracks().forEach((track) => peerConn.current?.addTrack(track, stream));

      // ВКЛЮЧАЕМ UDP ТРАФИК
      activeUdpRef.current = true;
      setIsUdpStreaming(true);
      LiveAudioStream.start();

      console.log("МИКРОФОН ЗАХВАЧЕН, ТРАФИК ИДЕТ НА", LAPTOP_IP);

    } catch (e: any) {
      console.error("ОШИБКА ЗАХВАТА:", e.message);
    }
  };

  const processIceQueue = async () => {
    while (iceQueue.current.length > 0) {
      const cand = iceQueue.current.shift();
      await peerConn.current?.addIceCandidate(new RTCIceCandidate(cand)).catch(() => { });
    }
  };

  const startCall = async (ip: string) => {
    await setupPeer(ip);
    const offer = await peerConn.current?.createOffer();
    await peerConn.current?.setLocalDescription(offer);
    sendSignaling(ip, { type: 'offer', offer, fromIp: '127.0.0.1' });
  };

  const handleOffer = async (offer: any, fromIp: string) => {
    if (peerConn.current?.signalingState === 'stable') {
      await setupPeer(fromIp);
    }
    await peerConn.current?.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConn.current?.createAnswer();
    await peerConn.current?.setLocalDescription(answer);
    sendSignaling(fromIp, { type: 'answer', answer });
    processIceQueue();
  };

  const stopAll = () => {
    console.log("EMERGENCY_SHUTDOWN_INITIATED");
    activeUdpRef.current = false;
    setIsUdpStreaming(false);
    LiveAudioStream.stop();
    zeroconf.stop();
    if (peerConn.current) {
      peerConn.current.close();
      peerConn.current = null;
    }
    InCallManager.stop();
    setRemoteStream(null);
    console.log("SHUTDOWN_COMPLETE");
  };


  return (
    <View className="flex-1 bg-slate-950 p-5">
      <Stack.Screen options={{ title: 'COMM_CENTER', headerShown: false }} />

      {/* HEADER STATUS */}
      <View className="items-center mb-8 pt-10">
        <View className="bg-slate-900 px-4 py-1 rounded-full border border-slate-800">
          <Text className="text-cyan-500 font-mono text-[10px]">LOCAL_ID: {myServiceName}</Text>
        </View>

        {isUdpStreaming && (
          <View className="flex-row items-center mt-3 bg-red-500/10 px-3 py-1 rounded-md border border-red-500/20">
            <View className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-2" />
            <Text className="text-red-500 font-bold text-[10px] uppercase">UPLINK_TO_LAPTOP: ACTIVE</Text>
          </View>
        )}
      </View>

      {/* MAIN ACTION BUTTON */}
      <TouchableOpacity
        onPress={() => startCall('127.0.0.1')}
        activeOpacity={0.7}
        className="bg-cyan-600 p-6 rounded-3xl items-center mb-10 shadow-lg shadow-cyan-500/20 border-b-4 border-cyan-800"
      >
        <Text className="text-white font-black text-lg tracking-tighter">INITIATE_SYSTEM_TEST</Text>
        <Text className="text-cyan-100 text-[10px] font-mono mt-1 opacity-70">LAPTOP + LOOPBACK_STREAM</Text>
      </TouchableOpacity>
      {/* CONFIGURATION SECTION */}
      <View className="bg-slate-900 border border-slate-800 rounded-3xl p-5 mb-6 shadow-2xl">
        <Text className="text-slate-500 font-mono text-[10px] mb-4 uppercase tracking-widest">
            // Uplink_&_Security_Config:
        </Text>

        <View className="mb-4">
          <Text className="text-slate-600 font-mono text-[9px] mb-2 ml-1">LAPTOP_IPv4_TARGET</Text>
          <TextInput
            className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-cyan-400 font-mono text-sm"
            style={{ minHeight: 50 }} // Явная высота для надежности
            value={laptopIp}
            onChangeText={setLaptopIp}
            placeholder="0.0.0.0"
            placeholderTextColor="#334155"
          />
        </View>

        <View className="flex-row justify-between">
          <View style={{ width: '48%' }}>
            <Text className="text-slate-600 font-mono text-[9px] mb-2 ml-1">UDP_PORT</Text>
            <TextInput
              className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-cyan-400 font-mono text-sm"
              style={{ minHeight: 50 }}
              value={udpPort}
              onChangeText={setUdpPort}
              keyboardType="numeric"
            />
          </View>
          <View style={{ width: '48%' }}>
            <Text className="text-slate-600 font-mono text-[9px] mb-2 ml-1">ROOM_PASS</Text>
            <TextInput
              className="bg-slate-950 border border-emerald-900 rounded-2xl p-4 text-emerald-400 font-mono text-sm"
              style={{ minHeight: 50 }}
              value={tcpPort}
              onChangeText={setTcpPort}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>
      {/* DEVICES LIST */}
      <Text className="text-slate-500 font-bold text-[11px] mb-4 tracking-[2px] uppercase px-2">
      // Detected_Nodes:
      </Text>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.name}
        className="flex-1"
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => item.addresses?.[0] && startCall(item.addresses[0])}
            className="bg-slate-900 border border-slate-800 p-4 rounded-2xl mb-3 flex-row justify-between items-center"
          >
            <View>
              <Text className="text-white font-bold tracking-tight">{item.name}</Text>
              <Text className="text-slate-500 font-mono text-[10px] mt-1">{item.addresses?.[0] || 'RESOLVING...'}</Text>
            </View>
            <View className="bg-cyan-500/10 px-2 py-1 rounded border border-cyan-500/20">
              <Text className="text-cyan-500 font-mono text-[8px]">CONNECT</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="py-10 items-center border border-dashed border-slate-800 rounded-2xl">
            <Text className="text-slate-600 font-mono text-xs italic">SCANNING_FOR_NODES...</Text>
          </View>
        }
      />


      {/* BOTTOM CONTROLS */}
      <View className="mt-auto gap-y-3 pt-4">
        <TouchableOpacity
          onPress={() => { setDevices([]); zeroconf.scan('_voicechat', '_tcp', 'local.'); }}
          className="py-4 rounded-2xl border border-cyan-500/50 items-center"
        >
          <Text className="text-cyan-500 font-bold text-xs tracking-widest uppercase">Refresh_Network</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={stopAll}
          className="py-4 rounded-2xl bg-red-950/30 border border-red-900/50 items-center"
        >
          <Text className="text-red-500 font-bold text-xs tracking-widest uppercase">Emergency_Shutdown</Text>
        </TouchableOpacity>
      </View>

      {/* HIDDEN WEBRTC RENDERER */}
      {remoteStream && (
        <View className="absolute w-1 h-1 opacity-0">
          <RTCView streamURL={remoteStream.toURL()} style={{ flex: 1 }} />
        </View>
      )}
    </View>
  );
}
