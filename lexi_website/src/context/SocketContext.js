// ====================== PURPOSE OF THIS FILE ==========================
// to generalize socket.io initialization for all pages
import { createContext, useContext, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
    const socketRef = useRef(null);

    useEffect(() => {
        // create socket ONCE - if condition just to make sure socket isn't created twice inside React.StrictMode (index.js)
        if (!socketRef.current) {
            socketRef.current = io("http://localhost:5000", {
                autoConnect: true
            });
        }
        socketRef.current.on("connect", () => {
            console.log("Socket connected:", socketRef.current.id);

            const user = JSON.parse(localStorage.getItem("user"));
            if (user?.id) {
                socketRef.current.emit("register", user.id);
            }
        });

        //temporary log for "incoming_call"
        // socketRef.current.on("incoming_call", () => {
        //     console.log("Global: 'incoming_call' received!");
        // })

        socketRef.current.on("disconnect", () => {
            console.log("Socket disconnected");
        });

        return () => {
            // turn off listener before disconnecting socket
            socketRef.current.off("connect");
            // socketRef.current.off("incoming_call");
            socketRef.current.off("disconnect");
            // disconnect socket
            socketRef.current.disconnect();
            socketRef.current = null;
        };
    }, []);

    return (
        <SocketContext.Provider value={socketRef}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket() {
    const ctx = useContext(SocketContext);
    if (!ctx) {
        throw new Error("useSocket must be used inside SocketProvider");
    }
    return ctx;
}
