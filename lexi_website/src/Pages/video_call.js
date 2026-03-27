import React, { useEffect, useRef, useState } from "react";
import { useFetcher, useLocation, useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext.js";
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaPhone, FaSignLanguage } from "react-icons/fa";
import "../Styling/video_call.css";

export function Video_call() {
    const location = useLocation();
    const navigate = useNavigate();
    // location.state may contain { contact, isCaller, incomingOffer }
    const { contact, isCaller, incomingOffer: incomingOfferFromNav } = location.state || {}; // contact: { id, username }
    const callee = contact // just to normalize variable name, because main.js uses "contact"
    const user = JSON.parse(localStorage.getItem("user"));

    // localVideoRef is the smaller box that shows what the user's video feed looks like
    const localVideoRef = useRef(null);
    // removeVideoRef is the main box that shows the user's contact's screen
    const remoteVideoRef = useRef(null);
    // Store actual video/audio stream
    const localStreamRef = useRef(null);
    const pcRef = useRef(null);
    const socketRef = useRef(null);

    // buffer for an incoming offer (so we don't miss an offer sent before page is ready)
    // const incomingOfferRef = useRef(incomingOfferFromNav || null);
    // const { offer, from } = incomingOfferRef.current;
    
    // only specifically for the call_controls styling
    const [isHovered, setIsHovered] = useState(false);
    const hideTimer = useRef(null);
    // isMicOn and isCamOn are the basic buttons inside a call, to toggle mic, camera
    const [isMicOn, setIsMicOn] = useState(true);
    const [isCamOn, setIsCamOn] = useState(true);
    // isTranslateOn and setIsTranslate is for the translate panel button
    const [isTranslateOn, setIsTranslateOn] = useState(true);
    // const [callActive, setCallActive] = useState(false);
    const [otherUserId, setOtherUserId] = useState(callee?.id || null);
    // keep a ref for otherUserId that can be read synchronously inside PC handlers
    const otherUserIdRef = useRef(callee?.id || null);
    // STUN/TURN servers (replace/add your TURN server for production)
    const rtcConfig = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" }
            // { urls: "turn:your.turn.server:3478", username: "...", credential: "..." }
        ]
    };
    const pendingIceCandidatesRef = useRef([]);
    // ================== INIT Socket =====================
    // guards to only run certain startup code once
    // const socketMountedRef = useRef(false);
    const callerStartedRef = useRef(false);
    // import the general socket from App.js
    const appSocket = useSocket();
    // NOTE: we don't need the put the socket (appSocket) inside this useEffect (compared to main.js)
    // because this page is opened after the first render - call initiated in main.js
    useEffect(() => {
        // if (socketMountedRef.current) return;
        // socketMountedRef.current = true;
        // if (!appSocket.current) return;
        // initialize socket - use a shared one from App.js for all pages
        const s = appSocket.current;
        if (!s) return;
        socketRef.current = s;

        // s.on("connect", () => {
        //     console.log("socket connected", s.id);
        //     // register this user with server
        //     s.emit("register", user.id);
        // });

        // when callee receives incoming_call
        s.on("webrtc_offer", async (payload) => {
            console.log("CALLEE webrtc_offer entered!");
            console.log("webrtc_offer", payload);
            console.log("webrtc_offer RAW PAYLOAD:", payload);
            console.log("payload.type =", payload.type);
            console.log("isCaller =", isCaller);
            if (isCaller) {
                console.log("Error: user classified as caller!")
                return;
            }
            console.log("Received OFFER from caller", payload);
            const { offer, from } = payload;
            otherUserIdRef.current = from;
            setOtherUserId(from);
            // ensure local stream + pc are ready then process
            try {
                // Ensure camera is ready
                console.log("calling ensureLocalStream() in 'incoming_call' listener");
                await ensureLocalStream();
                // create the PeerConnection
                console.log("calling createPeerConnection() in 'incoming_call' listener");
                await createPeerConnection({ addLocalTracks: true });
                // process offer
                console.log("calling processIncomingOfferIfAny() in 'incoming_call' listener");
                await processIncomingOfferIfAny(offer);
            } catch (err) {
                console.error("Error handling incoming offer immediately:", err);
            }
        });
        // when caller receives answer
        s.on("answer_call", async (payload) => {
            console.log("answer_call received", payload);
            if (!pcRef.current) {
                console.warn("answer_call but no peer connection exists yet");
                return;
            }
            const answer = payload.answer || payload;
            try {
                await pcRef.current.setRemoteDescription(answer);
                // FLUSH BUFFERED ICE (caller side)
                await flushBufferedIce(pcRef.current);
                console.log("Caller: Remote description (answer) applied");
            } catch (err) {
                console.error("Error applying remote answer:", err);
            }
        });
        // ICE candidate from remote
        s.on("ice_candidate", async ({ from, candidate }) => {
            if (!candidate) return;
            if (!pcRef.current || !pcRef.current.remoteDescription) {
                // if we don't have pc yet, buffer candidate?
                console.warn("Received ICE candidate before pc exists — buffering.");
                pendingIceCandidatesRef.current.push(candidate);
                return;
            }
            try {
                console.log("Adding remote ICE candidate:", candidate);
                await pcRef.current.addIceCandidate(candidate);
            } catch (err) {
                console.warn("addIceCandidate error:", err);
            }
        });
        // remote end the call
        s.on("call_ended", (payload) => {
            console.log("call_ended", payload);
            endCall(false);
        });
        // listener to catch all events - for debugging reasons
        s.onAny((event, payload) => {
            console.log("VIDEO PAGE SOCKET EVENT:", event, payload);
        });
        return () => {
            // since we're using a shared socket for all pages, we'll only turn off the listeners instead of disconnecting the socket:
            s.off("webrtc_offer");
            s.off("answer_call");
            s.off("ice_candidate");
            s.off("call_ended");
        };
    }, [appSocket]);
    // --------------- Ensure caller has stream (video + audio) (ensureLocalStream()) + creates WebRTC peer connection (createPeerConnection()) + sends offer to callee (startAsCaller()) -------------------------------
    useEffect(() => {
        if (!isCaller) return;
        if (callerStartedRef.current) return;
        callerStartedRef.current = true;
        if (callee?.id) {
            // set both ref and state right away for caller path too
            otherUserIdRef.current = callee.id;
            setOtherUserId(callee.id);
            (async () => {
                await ensureLocalStream();
                await createPeerConnection({ addLocalTracks: true });
                await startAsCaller(callee.id).catch(err => {
                    console.error("startAsCaller error", err);
                });
            })();
        }
    }, [isCaller, callee?.id]);
    // ----------------- Ensure callee has camera ready on mount -----------------
    // useEffect(() => {
    //     // If this page is the callee (not the caller), proactively get camera and PC so we won't miss offers
    //     if (isCaller) return;

    //     (async () => {
    //         try {
    //             await ensureLocalStream();
    //         } catch (err) {
    //             console.error("Callee pre-warm failed:", err);
    //         }
    //     })();
    // }, [isCaller]);
    // =================================== FUNCTIONS DEFINITION ============================
    // ================== ensure local stream of device ========================
    async function ensureLocalStream() {
        if (localStreamRef.current?.active) return localStreamRef.current;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStreamRef.current = stream;
            console.log("localStreamRef.current", localStreamRef.current);
            if (localVideoRef.current) localVideoRef.current.srcObject = stream;
            return stream
        } catch (err) {
            console.error("getUserMedia error", err);
            throw err;
        }
    }
    // =================== Peer Connection ======================
    async function createPeerConnection({ addLocalTracks = true } = {}) {
        if (pcRef.current) {
            console.log("PC already exists, reusing");
            return pcRef.current;
        }
        const pc = new RTCPeerConnection(rtcConfig);
        pcRef.current = pc;
        // log transceivers here after peer connection created
        logTransceivers("AFTER PC CREATE");
        console.log("CREATE PEER CONNECTION NOW");
        // add local tracks
        if (addLocalTracks) {
            const localStream = localStreamRef.current;
            if (localStream) {
                // localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                const existingSenders = pc.getSenders();
                localStream.getTracks().forEach(track => {
                    const alreadyAdded = existingSenders.some(s => s.track === track);
                    if (!alreadyAdded) {
                        console.log("ADDING TRACK", track.kind);
                        pc.addTrack(track, localStream);
                    }
                });
            }
        }
        // log transceivers here after adding track
        logTransceivers("AFTER ADD LOCAL TRACKS");
        // when remote track arrives
        pc.ontrack = (evt) => {
            // attach first stream
            // if (remoteVideoRef.current && evt.streams && evt.streams[0]) {
            console.log("pc.ontrack event:", evt);
            if (evt.streams && evt.streams[0]) {
                console.log("REMOTE TRACK RECEIVED (stream)", evt.streams[0]);
                // if (remoteVideoRef.current) remoteVideoRef.current.srcObject = evt.streams[0] || evt.track;
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = evt.streams[0];
            } else if (evt.track) {
                // fallback: create stream from tracks
                const ms = new MediaStream();
                ms.addTrack(evt.track);
                console.log("REMOTE TRACK RECEIVED (single track)", evt.track);
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = ms;
            }
        };
        // ICE candidate discovered locally -> send to remote
        pc.onicecandidate = (event) => {
            if (!event.candidate) {
                // end of candidates
                return;
            }
            const target = otherUserIdRef.current;
            console.log("Local ICE candidate:", event.candidate, "sending to:", target);
            if (event.candidate && target && socketRef.current) {
                socketRef.current.emit("ice_candidate", {
                    to: target,
                    from: user.id,
                    candidate: event.candidate
                });
            }
        };
        pc.onconnectionstatechange = () => {
            console.log("pc connection state:", pc.connectionState);
            if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
                endCall(false);
            }
        };
        // we're returning pc here, even though we're not using it - just helps debugging easier
        return pc;
    }
    // ========================== Caller Start ===============================
    async function startAsCaller(targetId) {
        const pc = pcRef.current;
        if (!pc) {
            console.error("Cannot start: PeerConnection not ready.");
            return;
        }
        // create offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // log transceivers here
        logTransceivers("CALLER AFTER SET LOCAL OFFER");
        // emit to server -> server forwards to callee
        if (socketRef.current) {
            socketRef.current.emit("call_user", {
                to: targetId,
                from: user.id,
                username: user.display_name || user.username,
                offer
            });
            console.log("Caller: sent offer to server", { to: targetId });
        }
    }
    // function to flush buffered ICE:
    async function flushBufferedIce(pc) {
        if (pendingIceCandidatesRef.current.length > 0) {
            console.log(
                "Flushing buffered ICE candidates:",
                pendingIceCandidatesRef.current.length
            );

            for (const candidate of pendingIceCandidatesRef.current) {
                try {
                    await pc.addIceCandidate(candidate);
                } catch (err) {
                    console.warn("Buffered ICE add failed:", err);
                }
            }

            pendingIceCandidatesRef.current = [];
        }
    }
    // Called when we have an offer (maybe buffered) and we are ready (local stream + pc)
    async function processIncomingOfferIfAny(offer) {
        const pc = pcRef.current;
        if (!pc) {
            console.error("processIncomingOfferIfAny() called with no PC");
            return;
        }
        // debugging log
        console.log(
            "processIncomingOfferIfAny ENTER", pc.signalingState, "remoteDescription?", !!pc.remoteDescription
        );
        if (pc.remoteDescription) {
            console.warn("Remote offer already applied, skipping");
            return;
        }
        try {
            // console.log("Applying REMOTE OFFER:", remoteDesc);
            console.log("Applying REMOTE OFFER:", offer);
            // set remote description for peer connection (the caller's offer)
            await pc.setRemoteDescription(offer);
            // log transceivers here
            logTransceivers("CALLEE AFTER SET REMOTE OFFER");
            // create & set local answer
            console.log("Creating local answer…");
            const answer = await pc.createAnswer();
            // set local description for peer connection
            console.log("Setting local answer…");
            await pc.setLocalDescription(answer);
            // log transceivers here
            logTransceivers("CALLEE AFTER SET LOCAL ANSWER");
            // FLUSH BUFFERED ICE CANDIDATES HERE FOR CALLEE
            await flushBufferedIce(pc);
            // send answer back to caller
            if (socketRef.current) {
                socketRef.current.emit("answer_call", {
                    // to: offer.from,
                    to: otherUserIdRef.current,
                    from: user.id,
                    answer
                });
                console.log("Callee: sent answer to server!");
            }
        } catch (err) {
            console.error("Error processing incoming offer:", err);
        }
    }
    // =========================== Toggle devices =========================
    // Toggle Camera
    const toggleCamera = () => {
        const videoTrack = localStreamRef.current?.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            setIsCamOn(videoTrack.enabled);
        }
    };
    // Toggle Mic
    const toggleMic = () => {
        const audioTrack = localStreamRef.current?.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            setIsMicOn(audioTrack.enabled);
        }
    };
    // Toggle Translation panel
    const toggleTranslation = () => {
        setIsTranslateOn(prev => !prev)
    }
    // End call (if localEnd true, inform remote)
    function endCall(localEnd = true) {
        // close RTCPeerConnection
        if (pcRef.current) {
            try { pcRef.current.close(); } catch (e) {}
            pcRef.current = null;
        }
        // stop local tracks
        if (localStreamRef.current) {
            try {
                localStreamRef.current.getTracks().forEach(t => t.stop());
            } catch (e) {}
            localStreamRef.current = null;
        }
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        // setCallActive(false);
        if (localEnd && otherUserId && socketRef.current) {
            socketRef.current.emit("end_call", { to: otherUserId, from: user.id });
        }
        // navigate back to main or show summary
        navigate("/main");
    }
    // this function is just to help log tranceivers that catch offers for debugging
    // what's expected to see: "sendrecv" in both m-lines
    function logTransceivers(label) {
        const pc = pcRef.current;
        if (!pc) return;
        console.log(
            `[${label}] transceivers:`,
            pc.getTransceivers().map(t => ({
                mid: t.mid,
                kind: t.receiver.track?.kind,
                direction: t.direction,
                currentDirection: t.currentDirection
            }))
        );
    }
    // =============================== UI ==================================
    return (
        <div className="Call_window">
            {/* container for user's contact's screen (the larger one) */}
            <div className="remote_video_container">
                <video ref={remoteVideoRef} autoPlay playsInline className="remote_video"/>
            </div>
            {/* container for translation panel */}
            <div className={`translation_panel_wrapper ${isTranslateOn ? "open" : "closed"}`}>
                <div className="translation_panel">
                    {isTranslateOn ? (
                        // isTranslateOn == true --> show the panel
                        <>
                            <h3>Translation</h3>
                            <div className="translation_output">
                                <p>Waiting for signs...</p>
                            </div>
                        </>
                    ) : (
                        // isTranslateOn == false --> hide the panel
                        <FaSignLanguage size={24} />
                    )}
                </div>
            </div>
            {/* container for user's screen (the smaller one) */}
            <div className="local_video_container">
                <video ref={localVideoRef} autoPlay muted playsInline className="local_video"/>
                {/* overlay when camera is off */}
                {!isCamOn && (
                    <div className="camera_off_overlay">
                        <FaVideoSlash size={45}/>
                    </div>
                )}
            </div>

            {/* container for call controls (toggle mic, camera, hang up, etc.) */}
            <div className={`call_controls ${isHovered ? "activate_hover" : ""}`}
            onMouseEnter={() => {
                clearTimeout(hideTimer.current);
                setIsHovered(true);
            }}
            onMouseLeave={() => {
                hideTimer.current = setTimeout(() => {
                setIsHovered(false);
                }, 300);
            }}
            >
                <button className={`control_btn translate_btn ${!isTranslateOn ? "off" : ""}`} onClick={toggleTranslation}>
                {/* <button className="control_btn"> */}
                    <FaSignLanguage size={20} />
                </button>
                <button className={`control_btn mic_btn ${!isMicOn ? "off" : ""}`} onClick={toggleMic}>
                    {/* <img src={micOn} alt="mic" className="control_icon"/> */}
                    {isMicOn? <FaMicrophone size={20}/> : <FaMicrophoneSlash size={20}/>}
                </button>
                <button className={`control_btn cam_btn ${!isCamOn ? "off" : ""}`} onClick={toggleCamera}>
                    {/* {isCamOn ? "Turn Camera Off" : "Turn Camera On"} */}
                    {/* <img src={cameraOn} alt="camera" className="control_icon"/> */}
                    {isCamOn? <FaVideo size={20}/> : <FaVideoSlash size={20}/>}
                </button>
                <button className="control_btn hangup_btn" onClick={() => endCall(true)}>
                    {/* <img src={hangUp} alt="phone" className="control_icon"/> */}
                    <FaPhone size={20} />
                </button>
            </div>
        </div>
    )
}