import { useAuth } from "../context/AuthContext";
import FloatingCalculator from "./FloatingCalculator";

export default function FloatingCalcWrapper({ onClose }) {
  const { user } = useAuth();
  return <FloatingCalculator userId={user?.id || "guest"} onClose={onClose} />;
}
