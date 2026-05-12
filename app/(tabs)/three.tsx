import { Stack } from 'expo-router';
import React, { useState, useEffect, useRef } from 'react';
import {
	View,
	Text,
	TouchableOpacity,
	FlatList,
	Alert,
	Platform,
	PermissionsAndroid,
	TextInput,
	ScrollView,
	Keyboard,
	TouchableWithoutFeedback,
	KeyboardAvoidingView,
	NativeModules
} from 'react-native';
import InCallManager from 'react-native-incall-manager';
import { mediaDevices, RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCView } from 'react-native-webrtc';
import { useKeepAwake } from 'expo-keep-awake';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
	AndroidImportance,
	AndroidForegroundServiceType
} from '@notifee/react-native';
// ТВОИ КОНСТАНТЫ
const SERVER_URL = "http://192.168.1.46:3000";
const RECENT_ROOMS_KEY = "@recent_rooms_list";
const USER_NAME_KEY = "@user_custom_name";

const configuration = {
	iceServers: [
		{ urls: 'stun:://google.com' },
		{ urls: 'stun:://google.com' }
	]
};


export default function InternetChatRoom() {
	useKeepAwake();

	const [userName, setUserName] = useState('');
	const [roomID, setRoomID] = useState('');
	const [recentRooms, setRecentRooms] = useState<string[]>([]);
	const [inRoom, setInRoom] = useState(false);

	const [participants, setParticipants] = useState<any[]>([]);
	const [chatMessages, setChatMessages] = useState<any[]>([]);
	const [currentMsg, setCurrentMsg] = useState('');

	const [isMuted, setIsMuted] = useState(false);
	const [isSpeaker, setIsSpeaker] = useState(true);
	const [availableMics, setAvailableMics] = useState<any[]>([]);
	const [currentMicIdx, setCurrentMicIdx] = useState(0);

	const socket = useRef<any>(null);
	const peers = useRef<{ [key: string]: RTCPeerConnection }>({});
	const remoteStreams = useRef<{ [key: string]: any }>({});
	const peerNames = useRef<{ [key: string]: string }>({});
	const localStream = useRef<any>(null);
	const flatListRef = useRef<any>(null);

	useEffect(() => {
		setupAll();
		return () => {
			stopAll();
		};
	}, []);

	useEffect(() => {
		if (userName) AsyncStorage.setItem(USER_NAME_KEY, userName).catch(() => { });
	}, [userName]);

	const setupAll = async () => {
		await initApp();
		await loadPersistentData();
	};

	const initApp = async () => {
		if (Platform.OS === 'android') {
			await PermissionsAndroid.requestMultiple([
				PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
				PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
			]);
		}
		try {
			const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
			localStream.current = stream;
			const devices: any = await mediaDevices.enumerateDevices();
			setAvailableMics(devices.filter((d: any) => d.kind === 'audioinput'));
			InCallManager.start({ media: 'audio' });
			InCallManager.setForceSpeakerphoneOn(true);
		} catch (e) { console.log("Mic init error", e); }
	};

	const loadPersistentData = async () => {
		try {
			const savedName = await AsyncStorage.getItem(USER_NAME_KEY);
			setUserName(savedName || `Юзер-${Math.floor(Math.random() * 99)}`);
			const savedRooms = await AsyncStorage.getItem(RECENT_ROOMS_KEY);
			if (savedRooms) setRecentRooms(JSON.parse(savedRooms));
		} catch (e) { }
	};

	const saveRoomToRecent = async (id: string) => {
		const updated = [id, ...recentRooms.filter(r => r !== id)].slice(0, 8);
		setRecentRooms(updated);
		await AsyncStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
	};

	const removeRoom = async (id: string) => {
		const updated = recentRooms.filter(r => r !== id);
		setRecentRooms(updated);
		await AsyncStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
	};

	const updateUI = () => {
		const list = Object.keys(remoteStreams.current).map(id => ({ id, name: peerNames.current[id] || 'Собеседник' }));
		setParticipants([{ id: 'me', name: userName, isMe: true }, ...list]);
	};

	const connectToSocket = (targetRoom: string) => {
		socket.current = io(SERVER_URL, { transports: ['websocket'], reconnection: true });
		socket.current.on("chat-history", (h: any[]) => setChatMessages(h.map(m => ({ ...m, isMe: m.sender === userName }))));
		socket.current.on("signal", async (fromId: string, data: any) => {
			try {
				const pc = getOrCreatePeer(fromId);
				if (data.type === "offer") {
					peerNames.current[fromId] = data.name;
					await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
					const answer = await pc.createAnswer();
					await pc.setLocalDescription(answer);
					socket.current.emit("signal", fromId, { type: "answer", answer, name: userName });
				} else if (data.type === "answer") {
					await peers.current[fromId]?.setRemoteDescription(new RTCSessionDescription(data.answer));
				} else if (data.type === "ice") {
					await peers.current[fromId]?.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => { });
				}
			} catch (e) { }
		});
		socket.current.on("user-joined", ({ id, name }: any) => {
			peerNames.current[id] = name;
			setTimeout(() => initiateCall(id), 1000);
		});
		socket.current.on("chat", (m: any) => setChatMessages(prev => [...prev, { ...m, isMe: false }]));
		socket.current.on("user-left", (id: string) => {
			if (peers.current[id]) {
				peers.current[id].close();
				delete peers.current[id]; delete remoteStreams.current[id];
				updateUI();
			}
		});
		socket.current.emit("join-room", targetRoom, userName);
	};

	const joinRoom = async (id?: string) => {
		const target = id || roomID;
		if (!target) return Alert.alert("Ошибка", "Введите название");

		setRoomID(target);
		saveRoomToRecent(target);
		connectToSocket(target);

		// --- ВМЕСТО CALLKEEP ИСПОЛЬЗУЕМ NOTIFEE ---
		try {
			// 1. Создаем канал для уведомлений (нужно для Android)
			const channelId = await notifee.createChannel({
				id: 'incoming-calls',
				name: 'Голосовой чат',
				importance: AndroidImportance.HIGH,
				sound: 'default',
			});

			// 2. Отображаем уведомление
			await notifee.displayNotification({
				title: 'Голосовой чат',
				body: `Вы в комнате: ${target}`,
				android: {
					channelId,
					asForegroundService: true,
					color: '#4caf50',
					pressAction: { id: 'default' },
				},
			});




		} catch (e) {
			console.log("Notifee Display Error", e);
		}

		setInRoom(true);
		updateUI();
	};


	const initiateCall = async (remoteId: string) => {
		try {
			const pc = getOrCreatePeer(remoteId);
			const offer = await pc.createOffer();
			await pc.setLocalDescription(offer);
			socket.current.emit("signal", remoteId, { type: "offer", offer, name: userName });
		} catch (e) { }
	};

	const getOrCreatePeer = (remoteId: string) => {
		if (peers.current[remoteId]) return peers.current[remoteId];
		let pc;
		try { pc = new RTCPeerConnection(configuration); } catch (err) { pc = new RTCPeerConnection({ iceServers: [] }); }
		const pcAny = pc as any;
		pcAny.onicecandidate = (e: any) => { if (e.candidate) socket.current.emit("signal", remoteId, { type: "ice", candidate: e.candidate }); };
		pcAny.ontrack = (e: any) => { if (e.streams && e.streams) { remoteStreams.current[remoteId] = e.streams; updateUI(); } };
		if (localStream.current) localStream.current.getTracks().forEach((t: any) => pc.addTrack(t, localStream.current));
		peers.current[remoteId] = pc;
		return pc;
	};

	const sendChatMessage = () => {
		if (!currentMsg.trim()) return;
		const msg = { text: currentMsg, sender: userName, isMe: true };
		setChatMessages(prev => [...prev, msg]);
		socket.current.emit("chat", roomID, msg);
		setCurrentMsg('');
	};

	const toggleMute = () => {
		const newState = !isMuted;
		setIsMuted(newState);
		if (localStream.current) localStream.current.getAudioTracks().forEach((t: any) => t.enabled = !newState);
	};

	const toggleSpeaker = () => {
		const newState = !isSpeaker;
		InCallManager.setForceSpeakerphoneOn(newState);
		setIsSpeaker(newState);
	};

	const switchMicrophone = async () => {
		if (availableMics.length < 2) return;
		const nextIdx = (currentMicIdx + 1) % availableMics.length;
		try {
			const newStream = await mediaDevices.getUserMedia({ audio: { deviceId: { exact: availableMics[nextIdx].deviceId } }, video: false });
			const newTrack = newStream.getAudioTracks()[0];
			Object.values(peers.current).forEach((pc: any) => {
				const sender = pc.getSenders().find((s: any) => s.track?.kind === 'audio');
				if (sender) sender.replaceTrack(newTrack);
			});
			setCurrentMicIdx(nextIdx);
		} catch (e) { }
	};

	const stopAll = async () => {
		if (socket.current) socket.current.disconnect();
		Object.values(peers.current).forEach(p => p.close());

		// Убираем уведомление чата
		await notifee.cancelAllNotifications();

		peers.current = {};
		remoteStreams.current = {};
		setInRoom(false);
		InCallManager.stop();
	};

	return (
		<View className="flex-1 bg-slate-950">
			<Stack.Screen options={{ headerShown: false }} />

			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
				keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 5}
				className="flex-1"
			>
				<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
					<View className="flex-1 p-5">
						{!inRoom ? (
							<ScrollView className="flex-1 mt-10" showsVerticalScrollIndicator={false}>
								<View className="p-6 bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl mb-6">
									<Text className="text-cyan-400 font-bold uppercase mb-2 text-[10px] tracking-widest">Профиль</Text>
									<TextInput
										placeholder="Ваш ник"
										placeholderTextColor="#334155"
										className="text-white text-2xl font-bold border-b border-slate-800 pb-2 mb-4"
										value={userName}
										onChangeText={setUserName}
									/>
								</View>

								<View className="p-6 bg-slate-900 rounded-3xl border border-slate-800 shadow-2xl mb-6">
									<Text className="text-slate-500 text-[10px] uppercase mb-2">Название комнаты</Text>
									<TextInput
										placeholder="Введите ID"
										placeholderTextColor="#475569"
										className="text-white bg-slate-950 p-4 rounded-2xl mb-4 border border-slate-800"
										value={roomID}
										onChangeText={setRoomID}
									/>
									<TouchableOpacity onPress={() => joinRoom()} className="bg-cyan-600 p-5 rounded-2xl shadow-xl">
										<Text className="text-white text-center font-black uppercase tracking-widest">Войти</Text>
									</TouchableOpacity>
								</View>

								{recentRooms.length > 0 && (
									<View>
										<Text className="text-slate-500 font-bold mb-3 uppercase text-[10px] tracking-widest px-2">Недавние</Text>
										{recentRooms.map((id) => (
											<View key={id} className="flex-row items-center mb-2">
												<TouchableOpacity onPress={() => joinRoom(id)} className="flex-1 bg-slate-900 p-4 rounded-2xl border border-slate-800 flex-row justify-between items-center">
													<Text className="text-white font-bold text-base"># {id}</Text>
													<Text className="text-cyan-500 text-[10px] font-bold">ВОЙТИ →</Text>
												</TouchableOpacity>
												<TouchableOpacity onPress={() => removeRoom(id)} className="ml-2 bg-red-900/20 p-4 rounded-2xl border border-red-500/20">
													<Text className="text-red-500">✕</Text>
												</TouchableOpacity>
											</View>
										))}
									</View>
								)}
							</ScrollView>
						) : (
							<View className="flex-1 mt-6">
								<View className="flex-row justify-between items-center mb-4 px-1">
									<View>
										<Text className="text-green-500 text-2xl font-black"># {roomID}</Text>
										<Text className="text-[10px] uppercase font-bold text-cyan-400">Online Active</Text>
									</View>
									<TouchableOpacity onPress={stopAll} className="bg-red-500/10 px-6 py-2 rounded-full border border-red-500/30">
										<Text className="text-red-500 font-bold text-[10px] uppercase">Выход</Text>
									</TouchableOpacity>
								</View>

								<View className="h-20 mb-2">
									<FlatList horizontal showsHorizontalScrollIndicator={false} data={participants} renderItem={({ item }) => (
										<View className={`mr-3 p-4 rounded-2xl border ${item.isMe ? 'border-green-500 bg-green-500/5' : 'border-slate-800 bg-slate-900'} items-center justify-center min-w-[110px]`}>
											<Text className="text-base mb-1">{item.isMe ? '👤' : '🎤'}</Text>
											<Text className={`font-bold text-[10px] ${item.isMe ? 'text-green-500' : 'text-white'}`} numberOfLines={1}>{item.name}</Text>
										</View>
									)} />
								</View>

								<View className="flex-1 bg-slate-900/50 rounded-3xl border border-slate-800 p-4 mb-4">
									<FlatList
										ref={flatListRef}
										onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
										data={chatMessages}
										renderItem={({ item }) => (
											<View className={`mb-3 ${item.isMe ? 'items-end' : 'items-start'}`}>
												<Text className="text-slate-500 text-[8px] mb-1 font-bold uppercase">{item.sender}</Text>
												<View className={`p-3 rounded-2xl ${item.isMe ? 'bg-cyan-700 rounded-tr-none' : 'bg-slate-800 rounded-tl-none'}`}>
													<Text className="text-white text-sm">{item.text}</Text>
												</View>
											</View>
										)}
									/>
								</View>

								<View className="flex-row items-end mb-4 gap-2">
									<TextInput
										multiline
										placeholder="Текст..."
										placeholderTextColor="#475569"
										className="flex-1 bg-slate-900 text-white p-4 py-3 rounded-2xl border border-slate-800 min-h-[56px] max-h-32"
										value={currentMsg}
										onChangeText={setCurrentMsg}
									/>
									<TouchableOpacity onPress={sendChatMessage} className="bg-cyan-600 h-14 w-14 rounded-2xl items-center justify-center shadow-lg">
										<Text className="text-white text-xl">🚀</Text>
									</TouchableOpacity>
								</View>

								<View className="flex-row items-center gap-3">
									<TouchableOpacity
										onPress={toggleMute}
										className={`flex-1 h-14 rounded-2xl flex-row items-center justify-center border-2 ${isMuted ? 'bg-red-500/20 border-red-500' : 'bg-slate-800 border-slate-700'}`}
									>
										<Text className="text-lg mr-2">{isMuted ? '🔇' : '🎤'}</Text>
										<Text className={`font-black text-[10px] uppercase ${isMuted ? 'text-red-500' : 'text-white'}`}>{isMuted ? 'Muted' : 'Active'}</Text>
									</TouchableOpacity>
									<TouchableOpacity onPress={switchMicrophone} className="w-14 h-14 bg-slate-800 border-2 border-slate-700 rounded-2xl items-center justify-center"><Text className="text-xl">🔄</Text></TouchableOpacity>
									<TouchableOpacity onPress={toggleSpeaker} className={`w-14 h-14 rounded-2xl items-center justify-center border-2 ${isSpeaker ? 'bg-cyan-500/20 border-cyan-400' : 'bg-slate-800 border-slate-700'}`}>
										<Text className="text-xl">{isSpeaker ? '🔊' : '🔈'}</Text>
									</TouchableOpacity>
								</View>
							</View>
						)}
					</View>
				</TouchableWithoutFeedback>
			</KeyboardAvoidingView>

			<View className="absolute opacity-0 pointer-events-none">
				{localStream.current && <RTCView streamURL={localStream.current.toURL()} style={{ width: 1, height: 1 }} />}
				{Object.keys(remoteStreams.current).map(id => {
					const s = remoteStreams.current[id];
					return (s && typeof s.toURL === 'function') ? <RTCView key={id} streamURL={s.toURL()} style={{ width: 1, height: 1 }} /> : null;
				})}
			</View>
		</View>
	);
}
