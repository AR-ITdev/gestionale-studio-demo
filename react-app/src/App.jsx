import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom';
import { UnsavedChangesProvider } from './context/UnsavedChangesProvider';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import ClientiPage from './pages/ClientiPage';
import PaghePage from './pages/PaghePage';
import ContabilitaPage from './pages/ContabilitaPage';
import RedditiPage from './pages/RedditiPage';
import VariePage from './pages/VariePage';
import CassaPage from './pages/CassaPage';
import ElaborazioniPage from './pages/ElaborazioniPage';
import ReportPage from './pages/ReportPage';

function App() {
  return (
    <BrowserRouter>
      <UnsavedChangesProvider>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="clienti" element={<ClientiPage />} />

            {/* Paghe */}
            <Route path="paghe" element={<PaghePage />} />
            <Route path="paghe/:period" element={<PaghePage />} />
            <Route path="paghe/:period/:tab" element={<PaghePage />} />

            {/* Contabilità */}
            <Route path="contabilita" element={<ContabilitaPage />} />
            <Route path="contabilita/:period" element={<ContabilitaPage />} />

            {/* Redditi */}
            <Route path="redditi" element={<RedditiPage />} />
            <Route path="redditi/:period" element={<RedditiPage />} />

            {/* Varie */}
            <Route path="varie" element={<VariePage />} />
            <Route path="varie/:period" element={<VariePage />} />

            {/* Cassa & Pagamenti */}
            <Route path="cassa" element={<CassaPage />} />
            <Route path="cassa/:year" element={<CassaPage />} />
            <Route path="cassa/:year/:view" element={<CassaPage />} />
            <Route path="cassa/:year/:view/:customerName" element={<CassaPage />} />

            {/* Elaborazioni */}
            <Route path="elaborazioni" element={<ElaborazioniPage />} />
            <Route path="elaborazioni/:anno" element={<ElaborazioniPage />} />
            <Route path="elaborazioni/:anno/:cliente" element={<ElaborazioniPage />} />

            {/* Report */}
            <Route path="report" element={<ReportPage />} />
            <Route path="report/:cliente" element={<ReportPage />} />

            <Route path="*" element={<h2>Errore 404: Pagina non trovata</h2>} />
          </Route>
        </Routes>
      </UnsavedChangesProvider>
    </BrowserRouter>
  );
}

export default App;