import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { usePollWhenOffline } from '@/lib/realtime';
import { ChatFlow } from '@/components/chat/ChatFlow';
import { MyRequests, isActive, useMyRequests } from '@/components/chat/MyRequests';
import { QueuePanel } from '@/components/chat/QueuePanel';
import { PickupPanel } from '@/components/chat/PickupPanel';
import { PhoneStep } from '@/components/chat/PhoneStep';
import { useMainShop } from '@/lib/mainShop';
import { PrinterScrollIntro } from '@/components/PrinterScrollIntro';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Reveal } from '@/components/Reveal';

/** Home: the print assistant chat, with the shop's live queue beside it. */
export default function Home() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'mine' ? 'mine' : 'new';
  const shop = useMainShop().data;
  const shopId = shop?.id ?? null;
  const [chatKey, setChatKey] = useState(0);
  const mine = useMyRequests();
  const activeCount = mine.data?.filter(isActive).length ?? 0;
  const offline = usePollWhenOffline() !== false;

  // Returning customers with something in progress land on their requests (first load only).
  const decided = useRef(false);
  useEffect(() => {
    if (decided.current || !mine.data) return;
    decided.current = true;
    if (!params.get('view') && activeCount > 0) setParams({ view: 'mine' }, { replace: true });
  }, [mine.data, activeCount, params, setParams]);

  const reduce = useReducedMotion();
  const setView = (v: 'new' | 'mine') => setParams(v === 'mine' ? { view: 'mine' } : {}, { replace: true });

  return (
    <>
    <PrinterScrollIntro />
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
      {view === 'mine' && user ? (
        <PickupPanel
          onNew={() => {
            setChatKey((k) => k + 1);
            setView('new');
          }}
        />
      ) : (
        <QueuePanel shopId={shopId} />
      )}
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <Reveal>
          <h1 className="display mt-4 text-[2.75rem] sm:text-[3.5rem] lg:mt-0">{view === 'mine' ? 'My requests' : 'Print something'}</h1>
          <p className="mt-1 max-w-[38rem] text-[1.125rem] leading-relaxed text-muted">{view === 'mine' ? 'Track your orders and pickup codes.' : 'Upload your files. We check them, you pay, and you collect at the counter with a code.'}</p>
        </Reveal>

        <div className="mt-8" />


        {offline && (
          <p role="status" className="mb-4 rounded-control bg-active px-3 py-2 text-[1rem]">
            Connection lost. Reconnecting… Statuses still refresh every 15 seconds.
          </p>
        )}

        <Reveal delay={0.1}>
        <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
        {view === 'mine' && user ? (
          <MyRequests
            onNew={() => {
              setChatKey((k) => k + 1);
              setView('new');
            }}
          />
        ) : view === 'mine' ? (
          <div className="space-y-3 text-[1.125rem]">
            <p>Sign in with your mobile number to see your requests.</p>
            <PhoneStep />
          </div>
        ) : (
          <ChatFlow key={chatKey} />
        )}
        </motion.div>
        </AnimatePresence>
        </Reveal>
      </div>
    </div>
    </>
  );
}
