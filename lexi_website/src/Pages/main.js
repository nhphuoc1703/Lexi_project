import React, { useState, useEffect, useRef } from "react";
import { data, useNavigate } from "react-router-dom";
// for real-time functionalities (e.g. real-time notifications)
// import { io } from "socket.io-client";
import { useSocket } from "../context/SocketContext.js";
import logo from '../assets/lexi_web_icon.png';
import { FaUserPlus, FaBell, FaSignOutAlt, FaPhone, FaTimes, FaCog } from "react-icons/fa";
import "../Styling/main.css";

export function Main() {
    // load in user from sign in page - after user have logged in/signed up with a valid account
    // we put user in useState because React will store this "user" object for repeated use, instead of each useEffect re-rendering and creating a new "user" object
    // we write "[user]" to deconstruct the array that useState() returns by default
    const [user, setUser] = useState(() => {
        return JSON.parse(localStorage.getItem("user"));
    });
    // navigate back to login/sign up page if someone tries to go to main manually
    const navigate = useNavigate();
    useEffect(() => {
        if (!localStorage.getItem("token")) {
            navigate("/"); // back to login
        }
    }, [navigate]);
    // fetching contacts of a user to show in the contacts box
    useEffect(() => {
        async function fetchContacts() {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;

                const res = await fetch(`http://localhost:5000/api/friends/${user.id}`, {
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                });

                const data = await res.json();
                setContacts(data);

            } catch (err) {
                console.error("Error loading contacts:", err);
            }
        }

        fetchContacts();
    }, [user]);
    // function for when user sends a friend request
    async function sendFriendRequest() {
        try {
            const token = localStorage.getItem("token");
            const senderId = user.id;

            const res = await fetch("http://localhost:5000/api/friend-requests/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    senderId,
                    receiverQuery: friendInput,
                }),
            });
            if (!res.ok) {
                setAlertMsg("Something went wrong.");
                return;
            }
            const data = await res.json();
            // setAlertMsg(data.message || data.error);
            if (data.success) {
                setFriendInput("");
            }
        } catch (err) {
            setAlertMsg("Error sending request");
        }
    }
    // fetching incoming friend requests
    useEffect(() => {
        async function fetchIncomingRequests() {
            try {
                const token = localStorage.getItem("token");
                if (!token) return;
                const res = await fetch(`http://localhost:5000/api/friend-requests/incoming/${user.id}`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                if (!res.ok) {
                    if (res.status === 401) {
                        console.warn("Unauthorized – redirecting to login");
                        alert("Unauthorized – redirecting to login");
                        navigate("/sign_in");
                    }
                    return;
                }
                const data = await res.json();
                // // Normalize shape
                // const normalized = data.map(req => ({
                //     id: req.id,
                //     username: req.username,
                //     senderId: req.senderId || null
                // }));
                // setFriendRequests(normalized);
                if (!Array.isArray(data)) {
                    console.error("Unexpected response:", data);
                    setFriendRequests([]);
                    return;
                }

                setFriendRequests(
                    data.map(req => ({
                        id: req.id,
                        username: req.username,
                        senderId: req.senderId ?? null
                    }))
                );
            } catch (err) {
                console.error("Error loading incoming requests:", err);
            }
        }

        fetchIncomingRequests();
    }, [user, navigate]);
    // functions to accept friend requests
    async function acceptRequest(requestId) {
        const token = localStorage.getItem("token");

        const res = await fetch("http://localhost:5000/api/friend-requests/accept", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ requestId }),
        });

        const data = await res.json();
        alert("Friend added!");

        // Re-fetch requests + contacts
        window.location.reload();
    }
    // function to decline friend requests
    async function declineRequest(requestId) {
        const token = localStorage.getItem("token");

        await fetch("http://localhost:5000/api/friend-requests/decline", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ requestId }),
        });

        alert("Request declined.");
        window.location.reload();
    }
    // function to start call - navigate to video-call.js:
    function startCall(contact) {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
            console.error("Socket not connected");
            return;
        }
        console.log("Calling:", contact);

        // This will eventually trigger:
        // - createOffer()
        // - send offer over WebSocket
        // - open call UI
        
        // socket.emit("call_user", {
        socket.emit("ring_user", {
            from: user.id,
            to: contact.id,
            username: user.display_name || user.username
        });
        // we don't want to navigate straight to /video_call right away anymore, only after callee accept the call
        // navigate("/video_call", { state: { contact, isCaller: true }})
    }
    // function to accept call
    function acceptCall() {
        if (!incomingCall) {
            console.warn("Accept clicked before offer arrived");
            return;
        }
        const socket = socketRef.current;
        socket.emit("accept_call", {
            from: user.id,
            to: incomingCall.from
        });
        navigate("/video_call", { 
            state: { 
                contact: { id: incomingCall.from, username: incomingCall.username },
                isCaller: false,
                // incomingOffer: incomingCall.
                incomingOffer: offerForVideoCall
            }
        });
        setIncomingCall(null);
    }
    // function to decline call
    function declineCall() {
        if (!incomingCall) return;
        const socket = socketRef.current;
        if (!socket) {
            console.error("Socket not connected");
            return;
        }
        socket.emit("end_call", { 
            to: incomingCall.from, 
            from: user.id 
        });
        setIncomingCall(null);
    }
    // ==================== REFERENCE for the slider (for settings popup) ==================
    const inputSliderRef = useRef(null);
    const outputSliderRef = useRef(null);
    // =========== variables for storing elements on the webpage and functions to set them, and their default ================
    const [inputVolume, setInputVolume] = useState(50); // default to 50% for now, should just be whatever user put last login later
    const [outputVolume, setOutputVolume] = useState(50); // default to 50% for now, should just be whatever user put last login later
    const [showAccount, setShowAccount] = useState(false);
    const [contacts, setContacts] = useState([]);
    const [selectedProfile, setSelectedProfile] = useState(null);
    // specifically for the left panel popup 
    const [showMenu, setShowMenu] = useState(false);
    const [closeMenu, setCloseMenu] = useState(false);
    // specifically for the add friend button, and its popup
    const [showAddFriend, setShowAddFriend] = useState(false);
    const [friendInput, setFriendInput] = useState("");
    const [alertMsg, setAlertMsg] = useState("");
    // specifically for the friends notification button, and its popup
    const [showNotifications, setShowNotifications] = useState(false);
    const [friendRequests, setFriendRequests] = useState([]);
    // specifically for the settings popup
    const [showSettings, setShowSettings] = useState(false);
    // specifically for the settings text input field - to control the state of the "save" button
    const [settingsForms, setSettingsForms] = useState({
        profile: {
            displayName: user?.display_name || "",
            username: user?.username || ""
        },
        account: {
            email: user?.email || "",
            oldPassword: "",
            newPassword: "",
            confirmPassword: ""
        },
        device: {
            inputVolume: 50,
            outputVolume: 50,
            outputDevice: "default",
            inputDevice: "default",
            camera: "default",
            resolution: "720p"
        }
    });
    const [initialSettingsForms, setInitialSettingsForms] = useState({
        profile: {
            displayName: user?.display_name || "",
            username: user?.username || ""
        },
        account: {
            email: user?.email || "",
            oldPassword: "",
            newPassword: "",
            confirmPassword: ""
        },
        device: {
            inputVolume: 50,
            outputVolume: 50,
            outputDevice: "default",
            inputDevice: "default",
            camera: "default",
            resolution: "720p"
        }
    });
    // specifically for storing initial device state (for the devices setting)
    const [availableDevices, setAvailableDevices] = useState({
        inputDevices: [],
        outputDevices: [],
        cameras: []
    });
    // specifically for each tab inside the settings popup (possible values e.g. "profile", "account", "device", etc.)
    const [activeSettingsTab, setActiveSettingsTab] = useState("profile");
    // specifically for updating settings
    const [settingsError, setSettingsError] = useState("");
    const [settingsSuccess, setSettingsSuccess] = useState("");
    const [saving, setSaving] = useState(false);
    // specifically for incoming calls
    const [incomingCall, setIncomingCall] = useState(null);
    const [offerForVideoCall, setOfferForVideoCall] = useState(null);
    // for the search bar behaviors
    const [searchQuery, setSearchQuery] = useState("");
    const [showSearchResults, setShowSearchResults] = useState(false);
    // import the shared socket.io from App.js
    const socketRef = useSocket();
    // updating real-time notifications
    useEffect(() => {
        // const s = io("http://localhost:5000");
        const s = socketRef.current;
        if (!s) return;
        // register this user with server
        // s.emit("register", user.id);
        // s.on("connect", () => {
        //     console.log("Connected to websocket:", s.id);
        //     s.emit("register", user.id);
        // });
        s.on("new_friend_request", (data) => {
            // instantly update friendRequests list
            setFriendRequests(prev => [...prev, {
                id: data.requestId,
                username: data.username,
                senderId: data.senderId
            }]);
        });
        s.on("incoming_call", (payload) => {
            console.log("Incoming call:", payload);
            // if (payload.offer) {
            //     // This is the REAL WebRTC offer
            //     setOfferForVideoCall(payload.offer);
            //     return;
            // }
            // // This is only for the pop up
            // setIncomingCall(payload);
            if (payload.type === "ring") {
                // UI popup
                console.log("main.js incoming_call received!");
                setIncomingCall(payload);
                return;
            }

            // if (payload.type === "offer") {
            //     // Store WebRTC offer until the call screen loads
            //     console.log("Storing incoming WebRTC offer");
            //     setOfferForVideoCall(payload.offer);
            //     return;
            // }
        });
        s.on("call_accepted", ({ from }) => {
            s.off("incoming_call");
            navigate("/video_call", {
                state: { isCaller: true, contact: { id: from } }
            });
        });
        return () => {
            // s.disconnect();
            s.off("new_friend_request");
            s.off("incoming_call");
            s.off("call_accepted");
        };
    }, [socketRef.current]);
    // Fetch devices (for the settings) when Settings popup is open
    useEffect(() => {
        if (!showSettings) return;

        const loadDevices = async () => {
            // ensure device permission
            await requestMediaPermission();
            const devices = await getAvailableDevices();
            setAvailableDevices(devices);
        };

        loadDevices();
    }, [showSettings]);
    // Update when there's a device change (i.e. user unplugs their devices)
    useEffect(() => {
        const handleDeviceChange = async () => {
            const devices = await getAvailableDevices();
            setAvailableDevices(devices);
        };

        navigator.mediaDevices.addEventListener(
            "devicechange",
            handleDeviceChange
        );

        return () => {
            navigator.mediaDevices.removeEventListener(
                "devicechange",
                handleDeviceChange
            );
        };
    }, []);
    // Update slider value for color fill
    useEffect(() => {
        if (!showSettings) return;

        // ensure visual fill matches stored values
        applySliderFill(inputVolume, inputSliderRef);
        applySliderFill(outputVolume, outputSliderRef);
    }, [showSettings, inputVolume, outputVolume]);
    // Variable to update slider CSS variable dynamically
    const handleSliderChange = (e, setter, formUpdater) => {
        const value = e.target.value;
        // for UI state
        setter(value);
        // for CSS visual fill
        e.target.style.setProperty('--value', `${value}%`);
        // for form state
        formUpdater(value);
    };
    // Variable to update slider color fill (purely for visuals)
    const applySliderFill = (value, sliderRef) => {
        if (!sliderRef?.current) return;
        sliderRef.current.style.setProperty("--value", `${value}%`);
    };
    // Variable to manage search bar behavior (a panel should appear from the search bar when input is typed in)
    const filteredContacts = contacts.filter(c =>
        c.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    // Variable to check if settings form fields have been changed or not (to dynamically disable "save" button)
    const isDirty = (tab) => {
        const current = settingsForms[tab];
        const initial = initialSettingsForms[tab];

        return Object.keys(current).some(
            key => current[key] !== initial[key]
        );
    };
    // Variable to request user's device permission before displaying it in settings 
    const requestMediaPermission = async () => { 
        try { 
            await navigator.mediaDevices.getUserMedia({ 
                audio: true,
                video: true 
            });
            stream.getTracks().forEach(track => track.stop()); 
        }
        catch (err) { 
            console.error("Media permission denied", err); 
        } 
    };
    // Variable to keep track of fields' initial value change
    const handleFormChange = (tab, field, value) => {
        setSettingsForms(prev => ({
            ...prev,
            [tab]: {
                ...prev[tab],
                [field]: value
            }
        }));
    };
    // Variable to get the actual user's input/output devices
    const getAvailableDevices = async () => {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
            inputDevices: devices.filter(d => d.kind === "audioinput"),
            outputDevices: devices.filter(d => d.kind === "audiooutput"),
            cameras: devices.filter(d => d.kind === "videoinput")
        };
    };
    // (helper) Variables for handleSaveSettings - to validate email and password
    const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const isStrongPassword = (pw) => pw.length >= 8;
    // Variable to handle saving user changes (making the "Save" buttons in settings popup actually work)
    const handleSaveSettings = async () => {
        const token = localStorage.getItem("token");
        setSettingsError("");
        setSettingsSuccess("");
        setSaving(true);
        try {
            // ***we use HTTP method PUT for update
            // if user is on "profile" settings tab
            if (activeSettingsTab === "profile") {
                // fetch profile (username, etc.) endpoint (/api/users/profile in userRoutes.js) and send update body with method PUT
                const res = await fetch("http://localhost:5000/api/users/profile", {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        username: settingsForms.profile.username
                    })
                });
                // get user data to display it on UI after change
                const data = await res.json();
                if (!res.ok) throw new Error(data.message);
                // update session user
                localStorage.setItem("user", JSON.stringify(data.user));
                // update React state (so the UI actually displays the new change)
                setUser(data.user);
                setSettingsSuccess("Profile updated");
            }
            // if user is on "account" settings tab
            if (activeSettingsTab === "account") {
                // email
                if (settingsForms.account.email !== initialSettingsForms.account.email) {
                    if (!isValidEmail(settingsForms.account.email)) {
                        throw new Error("Invalid email address");
                    }
                    // fetch email endpoint (api/users/email in userRoutes.js) and send update body with method PUT
                    const res = await fetch("http://localhost:5000/api/users/email", {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            email: settingsForms.account.email
                        })
                    });
                    // get user data to display it on UI after change
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);
                    // update session user
                    localStorage.setItem("user", JSON.stringify(data.user));
                    // update React state
                    setUser(data.user);
                }
                // password
                if (settingsForms.account.newPassword) {
                    if (settingsForms.account.newPassword !== settingsForms.account.confirmPassword) {
                        throw new Error("Passwords do not match!");
                    }
                    if (!isStrongPassword(settingsForms.account.newPassword)) {
                       throw new Error("Password must be at least 8 characters");
                    }
                    // fetch password endpoint (api/users/password in userRoutes.js) and send update body with method PUT
                    const res = await fetch("http://localhost:5000/api/users/password", {
                        method: "PUT",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            oldPassword: settingsForms.account.oldPassword,
                            newPassword: settingsForms.account.newPassword
                        })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);
                    // after password change, we're forcing logout so user can login again
                    alert("Password updated. Please log in again.");
                    localStorage.clear();
                    navigate("/sign_in");
                    return;
                }
                setSettingsSuccess("Account updated");
            }
            // if user is on "device" settings tab
            if (activeSettingsTab === "device") {
                // fetch device endpoint (api/users/settings/devices in userRoutes.js) and send update body with method PUT
                const res = await fetch("http://localhost:5000/api/users/settings/devices", {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify(settingsForms.device)
                });
                // check if the updated device settings exists
                if (!res.ok) throw new Error(data.message);
                // turn the updated device settings into json
                const data = await res.json();
                // Persist locally for instant reuse
                localStorage.setItem("deviceSettings", JSON.stringify(data));
                setSettingsSuccess("Device settings saved");
            }
            // update initial state so Save disables again
            setInitialSettingsForms(settingsForms);
            alert("Settings saved!");
        } catch (err) {
            setSettingsError(err.message || "Failed to save settings");
            console.error("Error saving settings:", err);
            alert("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };
    return (
        <div className="Page">
            <div className="header">
                <img src={logo} alt="logo" className="main-btn" onClick={() => setShowMenu(true)}/>        
                <div className="search_bar">
                    <input 
                        type="text" 
                        placeholder="Let's find your partner-in-chat"
                        value={searchQuery}
                        onChange={(e) => {
                            const value = e.target.value;
                            setSearchQuery(value);
                            setShowSearchResults(value.trim().length > 0);
                        }}
                        onFocus={() => {
                            if (searchQuery.trim()) setShowSearchResults(true);
                        }}
                        onBlur={() => {
                            // delay allows click on result before closing
                            setTimeout(() => setShowSearchResults(false), 150);
                        }}
                    />
                    {showSearchResults && (
                        <div className="search_dropdown">
                            {filteredContacts.length === 0 ? (
                                <div className="search_empty">
                                    No contacts found
                                </div>
                            ) : (
                                filteredContacts.map((c, i) => (
                                    <div
                                        key={i}
                                        className="search_result"
                                        onMouseDown={() => {
                                            setSelectedProfile(c);
                                            setSearchQuery("");
                                            setShowSearchResults(false);
                                        }}
                                    >
                                        <span className="search_name">{c.display_name}</span>
                                        <span className="search_username">@{c.username}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
                <div className="header_controls">
                    <button className="add_friend_btn" onClick={() => setShowAddFriend(true)}>
                        {/* + Add friend */}
                        <FaUserPlus size={18}/>
                    </button>
                    <button className="notif_btn" onClick={() => setShowNotifications(true)}>
                        {/* Notif */}
                        <FaBell size={18}/>
                    </button>
                </div>
            </div>
            <div className="settings_box">
                <div className="profile">
                    {/* includes a profile picture button for mic and input audio setting */}
                    <div className="my_account" onClick={() => setShowAccount(true)}>
                        {/* e.g. email, password,  */}
                        {/* <button onClick={() => setShowAccount(true)}>My account</button> */}
                        <div className="profile_image_container">
                            <img className="profile_image" src="https://via.placeholder.com/60" alt="Profile"/>
                            <span className="status_dot online"></span>
                        </div>
                        <div className="user_info">
                            <h4 className="display_name">{user?.display_name}</h4>
                            <p className="username">@{user?.username}</p>
                        </div>
                        <button
                            className="account_settings_btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowSettings(true);
                            }}
                            title="Settings"
                        >
                            <FaCog size={15} />
                        </button>
                    </div>
                </div>
                <div className="recent_calls">

                </div>
            </div>
            <div className="contacts_box">
                {/* list of added friends */}
                {contacts.length === 0 ? (
                    <p className="no_contacts">Go make new friends! We'll show them here once your friend list starts to build up!</p>
                ) : (
                    <div className="contacts_list">
                        {contacts.map((c, index) => (
                            <div className="contact_item" key={index} onClick={() => setSelectedProfile(c)}>
                                <div className="contact_display">
                                    <span className={`contact_status offline`}></span>
                                    <p className="contact_name">{c.display_name}</p>
                                </div>
                                {/* <span className={`contact_status ${c.status}`}></span>  - we can't use this for now because I need to update the database with status, and have the app constantly tracking user status*/}
                                <button className="call_btn" onClick={(e) => {
                                    e.stopPropagation();
                                    startCall(c);
                                }}><FaPhone size={18}/></button> 
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="profiles_box">
                {/* a specific friend's profile preview */}
                {!selectedProfile ? (
                    <p className="no_profile">Select a contact to view their profile</p>
                ) : (
                    <div className="profile_details">
                        <img
                            src={selectedProfile.profile_picture || "/default_profile.png"}
                            alt="Profile"
                            className="contact_profile_image"
                        />

                        <h2 className="profile_displayname">{selectedProfile.display_name}</h2>
                        <p className="profile_username">@{selectedProfile.username}</p>
                        <button className="profile_call_btn" onClick={() => startCall(selectedProfile)}>Call</button>
                        <div className="profile_status_wrapper">
                            {/* placeholder for status for now until database and status tracking is set up */}
                            {/* <span className={`status_dot ${selectedProfile.status}`}></span>
                            <span className="status_label">{selectedProfile.status}</span> */}
                            <span className={`status_dot offline`}></span>
                            <span className="status_label">offline</span>
                        </div>
                    </div>
                )}
            </div>
            {/* settings box popup */}
            {showSettings && (
                <div className="settings_overlay" onClick={() => setShowSettings(false)}>
                    <div className="settings_container" onClick={(e) => e.stopPropagation()}>
                        {/* Left side - settings menu */}
                        <div className="settings_sidebar">
                           <h3 className="settings_title">Settings</h3>
                           {/* Profile settings tab */}
                           <button
                                className={activeSettingsTab === "profile" ? "active" : ""}
                                onClick={() => setActiveSettingsTab("profile")}
                            >
                                Profile
                            </button>
                            {/* Account settings tab */}
                            <button
                                className={activeSettingsTab === "account" ? "active" : ""}
                                onClick={() => setActiveSettingsTab("account")}
                            >
                                Account
                            </button>
                            {/* Device settings tab */}
                            <button
                                className={activeSettingsTab === "device" ? "active" : ""}
                                onClick={() => setActiveSettingsTab("device")}
                            >
                                Device
                            </button>
                        </div>
                        {/* Right side - settings of each tab */}
                        <div className="settings_content">
                            {/* Close button */}
                            <button className="settings_close_btn" onClick={() => setShowSettings(false)} title="close">
                                <FaTimes size={20}/>
                            </button>
                            {/* Profile settings */}
                            {activeSettingsTab === "profile" && (
                                <div className="profile_settings">
                                    {/* e.g. display name, username, pronouns */}
                                    <h3>Profile Settings</h3>
                                    <label>Display Name</label>
                                    <div className="profile_settings_field">
                                        <input
                                            type="text"
                                            value={settingsForms.profile.displayName}
                                            onChange={(e) => handleFormChange("profile", "displayName", e.target.value)}
                                        />
                                    </div>
                                    <label>Username</label>
                                    <div className="profile_settings_field">
                                        <input 
                                            type="text" 
                                            value={settingsForms.profile.username}
                                            onChange={(e) => handleFormChange("profile", "username", e.target.value)} />
                                    </div>
                                    {settingsError && <p className="settings_error">{settingsError}</p>}
                                    {settingsSuccess && <p className="settings_success">{settingsSuccess}</p>}
                                    <div className="settings_actions" disabled={!isDirty(activeSettingsTab)} onClick={handleSaveSettings}>
                                        <button className="settings_actions_btn" disabled={!isDirty(activeSettingsTab) || saving}>{saving ? "Saving..." : "Save"}</button>
                                    </div>
                                </div>
                            )}
                            {/* Account settings */}
                            {activeSettingsTab === "account" && (
                                <form className="account_settings" onSubmit={(e) => {
                                    e.preventDefault();
                                }}>
                                    <h3>Account Settings</h3>
                                    <label>Email</label>
                                    <div className="account_settings_field">
                                        <input 
                                            type="email"
                                            value={settingsForms.account.email}
                                            onChange={(e) => handleFormChange("account", "email", e.target.value)}
                                            
                                        />
                                    </div>
                                    <label>Change password</label>
                                    <div className="account_settings_field">
                                        <input 
                                            type="password"
                                            value={settingsForms.account.oldPassword}
                                            onChange={(e) => handleFormChange("account", "oldPassword", e.target.value)}
                                            placeholder="Old password"
                                            autoComplete="current-password"
                                        />
                                    </div>
                                    <div className="account_settings_field">
                                        <input 
                                            type="password"
                                            value={settingsForms.account.newPassword}
                                            onChange={(e) => handleFormChange("account", "newPassword", e.target.value)}
                                            placeholder="New password"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <div className="account_settings_field">
                                        <input 
                                            type="password"
                                            value={settingsForms.account.confirmPassword}
                                            onChange={(e) => handleFormChange("account", "confirmPassword", e.target.value)}
                                            placeholder="Confirm new password"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    {settingsError && <p className="settings_error">{settingsError}</p>}
                                    {settingsSuccess && <p className="settings_success">{settingsSuccess}</p>}
                                    <div className="settings_actions" disabled={!isDirty(activeSettingsTab)} onClick={handleSaveSettings}>
                                        <button className="settings_actions_btn" disabled={!isDirty(activeSettingsTab) || saving}>{saving ? "Saving..." : "Save"}</button>
                                    </div>
                                </form>
                            )}
                            {/* Device settings */}
                            {activeSettingsTab === "device"  && (
                                <div className="device_settings">
                                    <div className="audio_settings">
                                        <h3>Audio settings</h3>
                                        <div className="mic_control">
                                            <label htmlFor="input_volume">Input volume</label>
                                            <div className="slider_container">
                                                <input
                                                    ref={inputSliderRef}
                                                    type="range"
                                                    id="input_volume"
                                                    min="0"
                                                    max="100"
                                                    value={inputVolume}
                                                    onChange={(e) => handleSliderChange(e, setInputVolume, (value) => handleFormChange("device", "inputVolume", value))}
                                                />
                                                <span className="volume_tooltip" style={{left: `${inputVolume}%`}}>{inputVolume}%</span>
                                            </div>
                                        </div>
                                        <div className="output_control">
                                            <label htmlFor="output_volume">Output volume</label>
                                            <div className="slider_container">
                                                <input
                                                    ref={outputSliderRef}
                                                    type="range"
                                                    id="output_volume"
                                                    min="0"
                                                    max="100"
                                                    value={outputVolume}
                                                    onChange={(e) => handleSliderChange(e, setOutputVolume, (value) => handleFormChange("device", "outputVolume", value))}
                                                />
                                                <span className="volume_tooltip" style={{left: `${outputVolume}%`}}>{outputVolume}%</span>
                                            </div>
                                        </div>
                                        <div className="input_selection">
                                            <label htmlFor="input_device">Input device</label>
                                            <select 
                                                id="input_device"
                                                value={settingsForms.device.inputDevice}
                                                onChange={(e) =>
                                                    handleFormChange("device", "inputDevice", e.target.value)
                                                }
                                            >
                                                {/* <option>Default speaker</option>
                                                <option>External speaker</option> */}
                                                {availableDevices.inputDevices.map((spk) => (
                                                    <option key={spk.deviceId} value={spk.deviceId}>
                                                        {spk.label || "Default microphone"}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="output_selection">
                                            <label htmlFor="output_device">Output device</label>
                                            <select 
                                                id="output_device"
                                                value={settingsForms.device.outputDevice}
                                                onChange={(e) =>
                                                    handleFormChange("device", "outputDevice", e.target.value)
                                                }
                                            >
                                                {/* <option>Default speaker</option>
                                                <option>External speaker</option> */}
                                                {availableDevices.outputDevices.map((spk) => (
                                                    <option key={spk.deviceId} value={spk.deviceId}>
                                                        {spk.label || "Default speaker"}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="video_settings">
                                        {/* e.g. , video input device, video quality, background? */}
                                        <h3>Video settings</h3>
                                        <label htmlFor="camera">camera</label>
                                        <select 
                                            id="camera"
                                            value={settingsForms.device.camera}
                                            onChange={(e) => 
                                                handleFormChange("device", "camera", e.target.value)
                                            }
                                        >
                                            {/* <option>Default camera</option>
                                            <option>External camera</option> */}
                                            {availableDevices.cameras.map((cam) => (
                                                <option key={cam.deviceId} value={cam.deviceId}>
                                                    {cam.label || "Default camera"}
                                                </option>
                                            ))}
                                        </select>
                                        <label htmlFor="resolution">Resolution</label>
                                        <select id="resolution">
                                            <option>720p</option>
                                            <option>1080p</option>
                                            <option>4K</option>
                                        </select>
                                    </div>
                                    {settingsError && <p className="settings_error">{settingsError}</p>}
                                    {settingsSuccess && <p className="settings_success">{settingsSuccess}</p>}
                                    <div className="settings_actions" disabled={!isDirty(activeSettingsTab)} onClick={handleSaveSettings}>
                                        <button className="settings_actions_btn" disabled={!isDirty(activeSettingsTab) || saving}>{saving ? "Saving..." : "Save"}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* account popup */}
            {showAccount && (
                <div className="account_popup" onClick={() => setShowAccount(false)}> {/* prevent closing when clicking inside */}
                    <div className="popup_content" onClick={(e) => e.stopPropagation()}>  
                        <h3>My Account</h3>
                        <p>Email: {user?.email}</p>
                        <p>Password: ••••••••</p>
                        <button onClick={() => setShowAccount(false)}>Close</button>
                    </div>
                </div>
            )}
            {/* left slide panel popup for logging out and other elements */}
            {showMenu && (
                <div className="side_menu_overlay" onClick={() => {
                    setCloseMenu(true);
                    setTimeout(() => {
                        setShowMenu(false);
                        setCloseMenu(false);
                    }, 250)
                }}>
                    <div className={`side_menu ${closeMenu ? "close" : ""}`} onClick={(e) => e.stopPropagation()}>
                        <button className="logout_btn" onClick={() => {
                            localStorage.removeItem("token");
                            localStorage.removeItem("user");
                            navigate("/sign_in");
                        }}><FaSignOutAlt size={15}/> Log out</button>
                    </div>
                </div>
            )}
            {/* pop up for the add friend button */}
            {showAddFriend && (
                <div className="add_friend_popup" onClick={() => setShowAddFriend(false)}>
                    <div className="add_friend_content" onClick={(e) => e.stopPropagation()}>
                        <h3>Add a Friend</h3>
                        <p>You can add a friend with their username</p>
                        <input 
                            type="text"
                            className="add_friend_input"
                            placeholder="@username or email"
                            value={friendInput}
                            onChange={(e) => setFriendInput(e.target.value)}
                        />
                        <button 
                            className="add_friend_submit"
                            onClick={() => {
                                // placeholder alert for now...
                                // alert("Feature coming soon! (UI is ready)");
                                // setFriendInput("");
                                // setShowAddFriend(false);
                                sendFriendRequest()
                            }}
                        >
                            Send Request
                        </button>
                        <p>{alertMsg}</p>
                        <button 
                            className="add_friend_close"
                            onClick={() => setShowAddFriend(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
            {/* popup for incoming friend requests button */}
            {showNotifications && (
                <div className="add_friend_popup" onClick={() => setShowNotifications(false)}>
                    <div className="add_friend_content" onClick={(e) => e.stopPropagation()}>
                        <h3>Friend Requests</h3>
                        {friendRequests.length === 0 ? (
                            <p>No new requests</p>
                        ) : (
                            friendRequests.map((req, i) => (
                                <div key={i} style={{ 
                                    display: "flex", 
                                    justifyContent: "space-between",
                                    margin: "10px 0"
                                }}>
                                    <span>@{req.username}</span>
                                    <div>
                                        <button className="add_friend_submit" onClick={() => acceptRequest(req.id)}>Accept</button>
                                        <button className="add_friend_close" onClick={() => declineRequest(req.id)} style={{ marginLeft: "10px" }}>Decline</button>
                                    </div>
                                </div>
                            ))
                        )}
                        <button className="add_friend_close" onClick={() => setShowNotifications(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
            {/* popup for incoming call from contacts */}
            {incomingCall && (
                <div className="incoming_call_popup" onClick={() => setIncomingCall(null)}>
                    <div className="incoming_call_content" onClick={(e) => e.stopPropagation()}>
                        <h3>Incoming Call</h3>
                        <p>@{incomingCall.username}</p>
                        <div className="incoming_call_buttons">
                            <button className="accept_call_btn" onClick={acceptCall}>
                                <FaPhone size={15}/>
                            </button>

                            <button className="decline_call_btn" onClick={declineCall}>
                                <FaPhone size={15} style={ {transform: "rotate(135deg)"} }/>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* render a separate darkened background effect for search_dropdown */}
            {showSearchResults && (
                <div className="search_mask" onClick={() => setShowSearchResults(false)}/>
            )}
        </div>
    )
}