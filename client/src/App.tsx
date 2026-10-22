import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout, RequireAuth } from './components/Layout';
import { Loading } from './components/ui';
import Home from './pages/Home';
import Shops from './pages/Shops';
import ShopDetailPage from './pages/ShopDetail';
import Login from './pages/Login';
import NotFound from './pages/NotFound';

// Dashboards and checkout are split out so the first load stays light on slow phones.
const PrintConfigure = lazy(() => import('./pages/PrintConfigure'));
const CartPage = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const PaymentResult = lazy(() => import('./pages/PaymentResult'));
const OrderTracking = lazy(() => import('./pages/OrderTracking'));
const Account = lazy(() => import('./pages/account/Account'));
const ShopDashboard = lazy(() => import('./pages/shop/ShopDashboard'));
const ShopOrderDetail = lazy(() => import('./pages/shop/ShopOrderDetail'));
const ShopPricing = lazy(() => import('./pages/shop/ShopPricing'));
const ShopRegister = lazy(() => import('./pages/shop/ShopRegister'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const InfoPage = lazy(() => import('./pages/info/InfoPage'));

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shops" element={<Shops />} />
          <Route path="shops/:id" element={<ShopDetailPage />} />
          <Route path="login" element={<Login />} />
          <Route path="print/:shopId" element={<RequireAuth><PrintConfigure /></RequireAuth>} />
          <Route path="cart" element={<RequireAuth><CartPage /></RequireAuth>} />
          <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="payment/:result/:orderId" element={<RequireAuth><PaymentResult /></RequireAuth>} />
          <Route path="orders/:id" element={<RequireAuth><OrderTracking /></RequireAuth>} />
          <Route path="account" element={<RequireAuth roles={['CUSTOMER', 'ADMIN']}><Account /></RequireAuth>} />
          <Route path="shop/register" element={<RequireAuth roles={['SHOP_OWNER']}><ShopRegister /></RequireAuth>} />
          <Route path="shop" element={<RequireAuth roles={['SHOP_OWNER', 'ADMIN']}><ShopDashboard /></RequireAuth>} />
          <Route path="shop/orders/:id" element={<RequireAuth roles={['SHOP_OWNER', 'ADMIN']}><ShopOrderDetail /></RequireAuth>} />
          <Route path="shop/pricing" element={<RequireAuth roles={['SHOP_OWNER', 'ADMIN']}><ShopPricing /></RequireAuth>} />
          <Route path="admin" element={<RequireAuth roles={['ADMIN']}><AdminDashboard /></RequireAuth>} />
          <Route path=":page" element={<InfoPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
