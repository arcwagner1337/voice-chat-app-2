import { Stack } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, FlatList, Alert } from 'react-native';
import Zeroconf from 'react-native-zeroconf';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCView } from 'react-native-webrtc';
import TcpSocket from 'react-native-tcp-socket';

const zeroconf = new Zeroconf();
const TCP_PORT = 12345;

export default function MeshChatScreen() {
  const iceQueue = useRef<any[]>([]);
  const [myServiceName] = useState(`User-${Math.floor(Math.random() * 1000)}`);
  const [devices, setDevices] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const [remoteStream, setRemoteStream] = useState<any>(null);

  const peerConn = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<any>(null);
  const server = useRef<any>(null);

  useEffect(() => {
    setupTcpServer();
    zeroconf.on('start', () => setIsScanning(true));
    zeroconf.on('stop', () => setIsScanning(false));
    zeroconf.on('resolved', (service) => {
      if (service.name !== myServiceName) {
        setDevices((prev) => prev.find(d => d.name === service.name) ? prev : [...prev, service]);
      }
    });

    return () => {
      stopAll();
    };
  }, []);

  const stopAll = () => {
    zeroconf.stop();
    zeroconf.unpublishService(myServiceName);
    server.current?.close();
    if (peerConn.current) peerConn.current.close();
    if (localStream.current) localStream.current.getTracks().forEach((t: any) => t.stop());
    setRemoteStream(null);
    InCallManager.stop();
  };

  const setupTcpServer = () => {
    server.current = TcpSocket.createServer((socket) => {
      socket.on('data', async (data) => {
        try {
          const msg = JSON.parse(data.toString());
          console.log("TCP MSG:", msg.type);

          if (msg.type === 'offer') {
             await handleOffer(msg.offer, msg.fromIp);
          } else if (msg.type === 'answer') {
             await peerConn.current?.setRemoteDescription(new RTCSessionDescription(msg.answer));
             processIceQueue();
          } else if (msg.type === 'ice') {
             if (peerConn.current?.remoteDescription) {
               await peerConn.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
             } else {
               iceQueue.current.push(msg.candidate);
             }
          }
        } catch (e) { console.log("TCP Parse Error:", e); }
      });
    }).listen({ port: TCP_PORT, host: '0.0.0.0' });
  };

  const sendSignaling = (ip: string, data: any) => {
    const client = TcpSocket.createConnection({ port: TCP_PORT, host: ip }, () => {
      client.write(JSON.stringify(data));
      
      // setTimeout(() => client.destroy(), 1000);
    });
    client.on('error', (err) => console.log("TCP Send Err:", err.message));
  };

  const setupPeer = async (remoteIp?: string) => {
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

    const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
    localStream.current = stream;
    stream.getTracks().forEach((track) => peerConn.current?.addTrack(track, stream));
  };

  const processIceQueue = async () => {
    while (iceQueue.current.length > 0) {
      const candidate = iceQueue.current.shift();
      await peerConn.current?.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.log);
    }
  };

  const startCall = async (ip: string) => {
    await setupPeer(ip);
    const offer = await peerConn.current?.createOffer();
    await peerConn.current?.setLocalDescription(offer);
    sendSignaling(ip, { type: 'offer', offer, fromIp: '127.0.0.1' }); // Тут в меше должен быть реальный IP
  };

  const handleOffer = async (offer: any, fromIp: string) => {
    await setupPeer(fromIp);
    await peerConn.current?.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConn.current?.createAnswer();
    await peerConn.current?.setLocalDescription(answer);
    sendSignaling(fromIp, { type: 'answer', answer });
    processIceQueue();
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Mesh Voice' }} />
      <View className="flex-1 bg-slate-900 p-6">
        <View className="flex-row justify-between items-center mb-6">
          <Text className="text-cyan-400 font-mono text-xs">ID: {myServiceName}</Text>
          <TouchableOpacity onPress={stopAll} className="bg-red-900/50 px-3 py-1 rounded-full">
            <Text className="text-red-400 text-xs">СБРОС</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          onPress={() => startCall('127.0.0.1')}
          className="bg-cyan-600 p-4 rounded-2xl mb-8 items-center"
        >
          <Text className="text-white font-bold">🧪 ТЕСТ САМОГО СЕБЯ</Text>
        </TouchableOpacity>

        <Text className="text-white text-lg font-bold mb-3">Устройства в Wi-Fi:</Text>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.name}
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-slate-800 p-4 rounded-xl mb-2 border border-slate-700"
              onPress={() => item.addresses?.[0] && startCall(item.addresses[0])}
            >
              <Text className="text-white font-bold">{item.name}</Text>
              <Text className="text-cyan-600 text-xs">{item.addresses?.[0] || 'Resolving...'}</Text>
            </TouchableOpacity>
          )}
        />

        <View className="mt-auto space-y-2">
          <TouchableOpacity onPress={() => { setDevices([]); zeroconf.scan('_voicechat', '_tcp', 'local.'); }} 
            className="p-4 rounded-xl border border-cyan-500 items-center">
            <Text className="text-cyan-400 font-bold">НАЙТИ СОСЕДЕЙ</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { zeroconf.publishService('_voicechat', '_tcp', 'local.', myServiceName, TCP_PORT); setIsPublished(true); }}
            className={`p-4 rounded-xl items-center ${isPublished ? 'bg-green-600' : 'bg-slate-700'}`}>
            <Text className="text-white font-bold">{isPublished ? 'ВИДИМ ДЛЯ ВСЕХ' : 'СТАТЬ ВИДИМЫМ'}</Text>
          </TouchableOpacity>
        </View>
        
        {remoteStream && <RTCView streamURL={remoteStream.toURL()} style={{ width: 0, height: 0 }} />}
      </View>
    </>
  );
}
