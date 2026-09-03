import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@/lib/theme";
import AppLayout from "@/layout/AppLayout";
import StartPage from "@/pages/StartPage";
import LibraryPage from "@/pages/LibraryPage";
import FlowPage from "@/pages/FlowPage";
import DiscoveryLibraryPage from "@/pages/DiscoveryLibraryPage";
import DiscoverySessionPage from "@/pages/DiscoverySessionPage";
import NotFound from "@/pages/NotFound";

const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<StartPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/flow/:id" element={<FlowPage />} />
            <Route path="/discovery" element={<DiscoveryLibraryPage />} />
            <Route path="/discovery/:id" element={<DiscoverySessionPage />} />
          </Route>
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
