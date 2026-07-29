import { useEffect, useState } from "react";
import { AppBar } from "@/components/common";
import { SettingsSection, SettingsToggleRow } from "@/components/settings";
import { Briefcase, Globe } from "@/components/Icons";
import { useApp } from "@/store";

/**
 * What appears in your feeds and on your map.
 *
 * "Show nearby providers" used to sit under Notifications, which is wrong twice
 * over: it isn't a notification preference (it filters discovery — see
 * discoveryService.ts and socialService.ts, which both read this key), and its
 * label said "Show" while its hint said "Hide". Both fixed here.
 */
export default function DiscoverySettings() {
  const { dataSaver, setDataSaver, showToast } = useApp();

  // Read by discoveryService.ts and socialService.ts at query time, so this
  // stays a device-local preference rather than a profile field.
  const [showProviders, setShowProviders] = useState(
    () => localStorage.getItem("settings_new_prov") !== "false"
  );

  useEffect(() => {
    localStorage.setItem("settings_new_prov", String(showProviders));
  }, [showProviders]);

  return (
    <div className="screen screen-boxed">
      <AppBar title="Discovery" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

        <SettingsSection title="What you see">
          <SettingsToggleRow
            icon={<Briefcase size={19} color="var(--green-600)" />}
            label="Show providers"
            hint="Include individual service providers in your feeds and map. They can still see and quote your requests."
            on={showProviders}
            onChange={(v) => {
              setShowProviders(v);
              showToast(v ? "Providers shown in discovery" : "Providers hidden from discovery");
            }}
          />
        </SettingsSection>

        <SettingsSection title="Data">
          <SettingsToggleRow
            icon={<Globe size={19} color="var(--blue-500)" />}
            label="Data saver"
            hint="Compresses images and reduces background loading on slower networks"
            on={dataSaver}
            onChange={(v) => {
              setDataSaver(v);
              showToast(v ? "Data saver on" : "Data saver off");
            }}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
