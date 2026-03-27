import React, { useState } from "react"
import "../Styling/sign_in.css"
import logo from '../assets/Lexi_logo.png';
import paint_drooling_effect from '../assets/paint_drooling_effect.png'
export function Sign_in() {
    // variable to get/store user opttions to either sign up or log in and change the front end accordingly
    const [action, setAction] = useState("Welcome back!")
    // variables to gather user input of the forms, and communicate to the backend
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    //submit logic
    const handleSubmit = async () => {
        setErrorMessage("");
        if (action === "Create an account") {
            // REGISTER
            try {
                const res = await fetch("http://localhost:5000/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username,
                        display_name: displayName,
                        email,
                        password
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    setErrorMessage(data.message || "Registration failed");
                    return;
                }
                alert("Account created! You can now login.");
                setAction("Welcome back!");
            } catch (err) {
                setErrorMessage("Server error");
            }
        } 
        else {
            // LOGIN
            try {
                const res = await fetch("http://localhost:5000/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email,
                        password
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    setErrorMessage(data.message || "Login failed");
                    return;
                }
                // Store JWT
                localStorage.setItem("token", data.token);
                // Store user for later - inside main page, call page, etc.
                localStorage.setItem("user", JSON.stringify(data.user));
                // Redirect to main page
                window.location.href = "/main";
            } catch (err) {
                setErrorMessage("Server error");
            }
        }
    };

    return (
        // <>
        //     <h1>This is sign_in page</h1>
        // </>
        <div className="page">
            <img src={logo} alt="logo" className="logo-top-left"/>        
            <div className="container">
                <div className="form-header">
                    <div className="form-text">{action}</div>
                    <div className="underline"></div>
                    {/* <img src={paint_drooling_effect} alt="paint_drooling_effect" className="paint_drooling_effect"/> */}
                </div>
                {errorMessage && (
                    <div className="error_box">{errorMessage}</div>
                )}
                <form className="inputs">
                    {action==="Welcome back!"?<div></div>:<div className="input">
                        {/* <img src={user_icon} alt=""/> */}
                        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)}/>
                    </div>}
                    {action==="Welcome back!"?<div></div>:<div className="input">
                        {/* <img src={user_icon} alt=""/> */}
                        <input type="text" placeholder="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)}/>
                    </div>}
                    <div className="input">
                        {/* <img src={email_icon} alt=""/> */}
                        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}/>
                    </div>
                    <div className="input">
                        {/* <img src={password_icon} alt=""/> */}
                        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}/>
                    </div>
                </form>
                <div className="form-submit-container">
                    {/* {action==="Login"?<div></div>:<div className="form-submit">Submit</div>} */}
                    <button className="form-submit" onClick={handleSubmit}>Submit</button>
                </div>
                {action==="Create an account"?<div></div>:<div className="forgot-password">Forgot password? <span>click here</span></div>}
                {action==="Create an account"?<div className="register-account">Already registered? go to Login</div>:<div className="register-account">Register an account? go to Sign Up</div>}
                <div className="submit-container">
                    <button className={action==="Welcome back!"?"submit gray":"submit"} onClick={()=>{setAction("Create an account")}}>Sign up</button>
                    <button className={action==="Create an account"?"submit gray":"submit"} onClick={()=>{setAction("Welcome back!")}}>Login</button>
                </div>
            </div>
        </div>
    )
}