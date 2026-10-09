import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { BiensListe, BienFiche } from './pages/Biens';
import { ContractantsListe, ContractantFiche } from './pages/Contractants';
import { ContratsListe, ContratNouveau } from './pages/Contrats';
import ContratFiche from './pages/ContratFiche';
import Echeancier from './pages/Echeancier';
import Campagne from './pages/Campagne';
import Revisions from './pages/Revisions';
import Charges from './pages/Charges';
import Documents from './pages/Documents';
import Generation from './pages/Generation';
import Alertes from './pages/Alertes';
import Recherche from './pages/Recherche';
import Etats from './pages/Etats';
import Cartographie from './pages/Cartographie';
import Audit from './pages/Audit';
import Referentiels from './pages/Referentiels';
import { AdminDroits, AdminGed, AdminReprise } from './pages/Admin';
import AdminGeneral from './pages/AdminGeneral';
import AdminFilien from './pages/AdminFilien';
import { Loading } from './components/ui';

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="biens" element={<BiensListe />} />
        <Route path="biens/:id" element={<BienFiche />} />
        <Route path="contractants" element={<ContractantsListe />} />
        <Route path="contractants/:id" element={<ContractantFiche />} />
        <Route path="contrats" element={<ContratsListe />} />
        <Route path="contrats/nouveau" element={<ContratNouveau />} />
        <Route path="contrats/:id" element={<ContratFiche />} />
        <Route path="echeancier" element={<Echeancier />} />
        <Route path="campagne" element={<Campagne />} />
        <Route path="revisions" element={<Revisions />} />
        <Route path="charges" element={<Charges />} />
        <Route path="documents" element={<Documents />} />
        <Route path="generation" element={<Generation />} />
        <Route path="alertes" element={<Alertes />} />
        <Route path="recherche" element={<Recherche />} />
        <Route path="cartographie" element={<Cartographie />} />
        <Route path="etats" element={<Etats />} />
        <Route path="audit" element={<Audit />} />
        <Route path="referentiels" element={<Referentiels />} />
        <Route path="admin/droits" element={<AdminDroits />} />
        <Route path="admin/general" element={<AdminGeneral />} />
        <Route path="admin/filien" element={<AdminFilien />} />
        <Route path="admin/ged" element={<AdminGed />} />
        <Route path="admin/reprise" element={<AdminReprise />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
