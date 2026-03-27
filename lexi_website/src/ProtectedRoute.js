import { Navigate } from "react-router-dom";
// if token is wrong/missing, navigate back to sign_in
export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");

  if (!token) {
    return <Navigate to="/sign_in" replace />;
  }

  return children;
}
