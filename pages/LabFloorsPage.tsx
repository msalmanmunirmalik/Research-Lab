import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import FloorsHub from '../components/lab-floors/FloorsHub';
import ScenarioPlayer from '../components/lab-floors/ScenarioPlayer';
import RoleplayStudio from '../components/lab-floors/RoleplayStudio';
import { AcademicCapIcon } from '../components/icons';
import { listLabFloors, getLabFloor } from '../utils/labFloors/registry';
import {
  listRoleplayModules,
  getRoleplayModule,
} from '../utils/labFloors/roleplayRegistry';
import {
  loadLabFloorsProgress,
  setLabFloorsRole,
} from '../utils/labFloors/progress';
import {
  isRoleplayComplete,
  loadRoleplayRun,
} from '../utils/labFloors/roleplayProgress';
import { hydrateLabFloorsFromServer } from '../utils/labFloors/sync';
import type { LabFloorsProgress, RoleId } from '../utils/labFloors/types';
import '../styles/labFloors.css';

const LabFloorsPage: React.FC = () => {
  const floors = useMemo(() => listLabFloors(), []);
  const roleplayModules = useMemo(() => listRoleplayModules(), []);
  const [progress, setProgress] = useState<LabFloorsProgress>(() => loadLabFloorsProgress());
  const [activeFloorId, setActiveFloorId] = useState<string | null>(null);
  const [activeRoleplayId, setActiveRoleplayId] = useState<string | null>(null);
  const [roleplayStampTick, setRoleplayStampTick] = useState(0);
  const [syncNote, setSyncNote] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const hydrated = await hydrateLabFloorsFromServer();
      if (cancelled || !hydrated) return;
      setProgress(hydrated.floors);
      setRoleplayStampTick((n) => n + 1);
      setSyncNote('Progress synced to your account');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFloor = activeFloorId ? getLabFloor(activeFloorId) : null;
  const activeRoleplay = activeRoleplayId ? getRoleplayModule(activeRoleplayId) : null;

  const roleplayDoneIds = useMemo(() => {
    void roleplayStampTick;
    return roleplayModules
      .filter((m) => isRoleplayComplete(m, loadRoleplayRun(m.id)))
      .map((m) => m.id);
  }, [roleplayModules, roleplayStampTick]);

  const handleRoleChange = (role: RoleId) => {
    setProgress(setLabFloorsRole(role));
  };

  const handleComplete = () => {
    setProgress(loadLabFloorsProgress());
  };

  return (
    <div className="lf-page space-y-5">
      <PageHeader
        title="Lab Floors"
        subtitle="Practice starting in research — AI roleplay and short choice floors. Progress saves to your RILOS account."
        accent="teal"
        icon={<AcademicCapIcon />}
      />
      {syncNote ? (
        <p className="text-[12px] text-teal-800/80 -mt-2" role="status">
          {syncNote}
        </p>
      ) : null}

      {activeRoleplay ? (
        <RoleplayStudio
          key={activeRoleplay.id}
          module={activeRoleplay}
          onExit={() => setActiveRoleplayId(null)}
          onComplete={() => setRoleplayStampTick((n) => n + 1)}
        />
      ) : activeFloor ? (
        <ScenarioPlayer
          key={activeFloor.id}
          floor={activeFloor}
          role={progress.role}
          onExit={() => setActiveFloorId(null)}
          onComplete={handleComplete}
          extraDebriefCta={
            activeFloor.id === 'idea-studio' ? (
              <Link to="/writing-studio" className="lf-btn lf-btn-ghost">
                Continue in Writing Studio
              </Link>
            ) : null
          }
        />
      ) : (
        <FloorsHub
          floors={floors}
          progress={progress}
          role={progress.role}
          onRoleChange={handleRoleChange}
          onStart={setActiveFloorId}
          roleplayModules={roleplayModules}
          roleplayDoneIds={roleplayDoneIds}
          onStartRoleplay={setActiveRoleplayId}
        />
      )}
    </div>
  );
};

export default LabFloorsPage;
