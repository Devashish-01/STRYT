import { useEffect, useState } from "react";
import { AppBar } from "@/components/common";
import { SettingsSection, SettingsToggleRow } from "@/components/settings";
import { Moon, Volume2, Store, FileText, Tag } from "@/components/Icons";
import { useApp } from "@/store";
import { userService } from "@/services";
import RadiusSelector from "@/components/RadiusSelector";

/**
 * Everything about what you get told, and how loudly. Split out of the old
 * monolithic /settings so the "Notifications" row in the hub opens a screen
 * that is actually only about notifications.
 *
 * Note the "Show nearby providers" toggle that used to live in this section is
 * NOT here — it was never a notification preference; it filters your discovery
 * feed and map, so it moved to Discovery where it belongs.
 */
export default function NotificationSettings() {
  const { user, showToast } = useApp();

  const [radius, setRadius] = useState(() => {
    const saved = localStorage.getItem("settings_radius");
    return saved ? Number(saved) : (user.notificationRadiusKm || 5);
  });
  const [silent, setSilent] = useState(user.notifSilent === true);
  const [quiet, setQuiet] = useState(user.notifQuietHours === true);
  const [newBiz, setNewBiz] = useState(user.notifNewBusiness !== false);
  const [reqs, setReqs] = useState(user.notifNearbyRequests !== false);
  const [offers, setOffers] = useState(user.notifOffers !== false);

  // Re-seed from the server profile once it lands (the initial state above runs
  // before `user` has hydrated on a cold open).
  useEffect(() => {
    setSilent(user.notifSilent === true);
    setQuiet(user.notifQuietHours === true);
    setNewBiz(user.notifNewBusiness !== false);
    setReqs(user.notifNearbyRequests !== false);
    setOffers(user.notifOffers !== false);
  }, [user.notifSilent, user.notifQuietHours, user.notifNewBusiness, user.notifNearbyRequests, user.notifOffers]);

  useEffect(() => {
    localStorage.setItem("settings_radius", String(radius));
    if (user.id && radius !== user.notificationRadiusKm) {
      void userService.update({ notificationRadiusKm: radius }).catch(() => {});
    }
  }, [radius, user.id, user.notificationRadiusKm]);

  /** Optimistic + revert + toast, per DESIGN_PRINCIPLES §6. These write to the
   *  DB (not just localStorage as they used to) because send-push reads them
   *  at delivery time — a switch that persists nowhere the server can see it
   *  can't actually change what gets delivered. */
  function persist(
    patch: Record<string, boolean>,
    apply: (v: boolean) => void,
    next: boolean,
    onLabel: string,
    offLabel: string,
  ) {
    apply(next);
    userService.update(patch as any)
      .then(() => showToast(next ? onLabel : offLabel))
      .catch(() => {
        apply(!next);
        showToast("Couldn't save — try again");
      });
  }

  return (
    <div className="screen screen-boxed">
      <AppBar title="Notifications" />
      <div className="screen-scroll page-pad col gap-16 scroll-pad-end" style={{ paddingTop: 14 }}>

        <RadiusSelector
          value={radius}
          onChange={setRadius}
          accentColor="var(--brand-600)"
          label="Notification radius"
          description="How far away you want to receive alerts and discover things."
        />

        <SettingsSection title="What you're told about">
          <SettingsToggleRow
            icon={<Store size={19} color="var(--orange-500)" />}
            label="New businesses nearby"
            hint="When a shop opens near you"
            on={newBiz}
            onChange={(v) => persist({ notifNewBusiness: v }, setNewBiz, v, "You'll hear about new shops", "New-shop alerts off")}
          />
          <SettingsToggleRow
            icon={<FileText size={19} color="var(--brand-700)" />}
            label="Nearby requests"
            hint="When a neighbour asks for something you could help with"
            on={reqs}
            onChange={(v) => persist({ notifNearbyRequests: v }, setReqs, v, "You'll hear about nearby asks", "Nearby-ask alerts off")}
          />
          <SettingsToggleRow
            icon={<Tag size={19} color="var(--pink-600)" />}
            label="Offers & deals"
            hint="Discounts from shops around you"
            on={offers}
            onChange={(v) => persist({ notifOffers: v }, setOffers, v, "You'll hear about offers", "Offer alerts off")}
          />
        </SettingsSection>

        <SettingsSection title="How they arrive">
          <SettingsToggleRow
            icon={<Moon size={19} color="var(--ink-600)" />}
            label="Silent notifications"
            hint="Show them, but never make a sound"
            on={silent}
            onChange={(v) => persist({ notifSilent: v }, setSilent, v, "Notifications are silent", "Notification sound on")}
          />
          <SettingsToggleRow
            icon={<Volume2 size={19} color="var(--ink-600)" />}
            label="Quiet hours"
            hint="Silence sounds between 10 PM and 7 AM"
            on={quiet}
            onChange={(v) => persist({ notifQuietHours: v }, setQuiet, v, "Quiet hours on", "Quiet hours off")}
          />
        </SettingsSection>

        <p className="tiny muted" style={{ padding: "0 2px", lineHeight: 1.5 }}>
          Bookings, queue updates, messages and payments always come through —
          these settings only cover discovery alerts.
        </p>
      </div>
    </div>
  );
}
