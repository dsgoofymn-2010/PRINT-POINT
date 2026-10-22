import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { usePollWhenOffline } from '@/lib/realtime';
import { ChatFlow } from '@/components/chat/ChatFlow';
import { MyRequests, isActive, useMyRequests } from '@/components/chat/MyRequests';
import { QueuePanel } from '@/components/chat/QueuePanel';
import { PhoneStep } from '@/components/chat/PhoneStep';
import { Tabs } from '@/components/ui';

const SHOP_KEY = 'pp_last_shop';

/** Home: the print assistant chat, with the chosen shop's live queue beside it. */
export default function Home() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'mine' ? 'mine' : 'new';
  const [shopId, setShopId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SHOP_KEY);
    } catch {
      return null;
    }
  });
  const [chatKey, setChatKey] = useState(0);
  const mine = useMyRequests();
  const activeCount = mine.data?.filter(isActive).length ?? 0;
  const offline = usePollWhenOffline() !== false;

  useEffect(() => {
    try {
      if (shopId) localStorage.setItem(SHOP_KEY, shopId);
    } catch {
      /* storage blocked: the side panel just starts empty next time */
    }
  }, [shopId]);

  // Returning customers with something in progress land on their requests (first load only).
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !mine.data) return;
    decided.current = true;
    if (!params.get('view') && activeCount > 0) setParams({ view: 'mine' }, { replace: true });
  }, [mine.data, activeCount, params, setParams]);

  const setView = (v: 'new' | 'mine') => setParams(v === 'mine' ? { view: 'mine' } : {}, { replace: true });

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
      <QueuePanel shopId={shopId} />
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <h1 className="display mt-4 text-[44px] sm:text-[56px] lg:mt-0">Print something</h1>
        <p className="mb-5 mt-1 text-[18px] text-muted">Send your files to a xerox shop nearby, pay once they accept, and collect with a code.</p>

        {user && (
          <div className="mb-6">
            <Tabs
              value={view}
              onChange={setView}
              tabs={[
                { value: 'new', label: 'New request' },
                { value: 'mine', label: 'My requests', count: activeCount },
              ]}
            />
          </div>
        )}

        {offline && (
          <p role="status" className="mb-4 rounded-control bg-active px-3 py-2 text-[16px]">
            Connection lost. Reconnecting… Statuses still refresh every 15 seconds.
          </p>
        )}

        {view === 'mine' && user ? (
          <MyRequests
            onNew={() => {
              setChatKey((k) => k + 1);
              setView('new');
            }}
          />
        ) : view === 'mine' ? (
          <div className="space-y-3 text-[18px]">
            <p>Sign in with your mobile number to see your requests.</p>
            <PhoneStep />
          </div>
        ) : (
          <ChatFlow key={chatKey} shopId={shopId} onShopChange={setShopId} />
        )}
      </div>
    </div>
  );
}
