import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout';
import { SKIP_LOGIN } from './lib/auth';
import { Loading } from './components/ui';
import Home from './pages/Home';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Owner and admin screens are split out so the customer's first load stays light on slow phones.
const OwnerDesk = lazy(() => import('./pages/owner/OwnerDesk'));
const Account = lazy(() => import('./pages/account/Account'));
const ShopDashboard = lazy(() => import('./pages/shop/ShopDashboard'));
const ShopPricing = lazy(() => import('./pages/shop/ShopPricing'));
const ShopRegister = lazy(() => import('./pages/shop/ShopRegister'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const InfoPage = lazy(() => import('./pages/info/InfoPage'));

/** Old links to /orders/:id now open the customer's requests. */
function OldOrderLink() {
  useParams();
  return <Navigate to="/?view=mine" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={SKIP_LOGIN ? <Navigate to="/" replace /> : <Login />} />
          <Route path="owner" element={<OwnerDesk />} />
          <Route path="orders/:id" element={<OldOrderLink />} />
          <Route path="shops/*" element={<Navigate to="/" replace />} />
          <Route path="account" element={<RequireAuth roles={['CUSTOMER', 'ADMIN']}><Account /></RequireAuth>} />
          <Route path="shop/register" element={<RequireAuth roles={['SHOP_OWNER']}><ShopRegister /></RequireAuth>} />
          <Route path="shop" element={<RequireAuth roles={['SHOP_OWNER', 'ADMIN']}><ShopDashboard /></RequireAuth>} />
          <Route path="shop/pricing" element={<RequireAuth roles={['SHOP_OWNER', 'ADMIN']}><ShopPricing /></RequireAuth>} />
          <Route path="admin" element={<RequireAuth roles={['ADMIN']}><AdminDashboard /></RequireAuth>} />
          <Route path=":page" element={<InfoPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
