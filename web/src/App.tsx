import { useHashRoute } from "./hooks/useHashRoute";
import { ProfileDetailPage } from "./pages/ProfileDetailPage";
import { ProfileListPage } from "./pages/ProfileListPage";
import "./app.css";

export function App() {
  const [route] = useHashRoute();

  if (route.type === "detail") {
    return <ProfileDetailPage profileId={route.profileId} />;
  }

  return <ProfileListPage />;
}
