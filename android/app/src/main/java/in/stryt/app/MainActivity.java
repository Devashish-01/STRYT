package in.stryt.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Must match android.notification.channel_id sent by the send-push edge
    // function (supabase/functions/send-push/index.ts).
    private static final String CHANNEL_ID = "stryt_default";
    // Sound-free sibling, used when the recipient has "Silent notifications" on
    // or is inside their quiet hours. A separate channel is required rather
    // than just omitting `sound` in the payload: on API 26+ the OS takes sound
    // and importance from the CHANNEL and ignores per-message values, so
    // per-notification silencing is impossible without a second channel.
    private static final String SILENT_CHANNEL_ID = "stryt_silent";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must run before super.onCreate() — that's when Capacitor's Bridge
        // collects registered plugins.
        registerPlugin(BatteryOptimizationPlugin.class);
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    // On Android 8+ (API 26+) a notification targeting a channel that does not
    // exist is silently dropped by the OS. Create the channels before any push
    // can arrive. Creating an existing channel is a no-op, so this is idempotent.
    //
    // NOTE: channels are immutable once created on a device — importance and
    // sound can't be changed by app code afterwards, only by the user in system
    // settings or by a reinstall. Get these right the first time.
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) {
                return;
            }

            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "STRYT Notifications",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);

            NotificationChannel silent = new NotificationChannel(
                    SILENT_CHANNEL_ID,
                    "Quiet notifications",
                    NotificationManager.IMPORTANCE_LOW);
            silent.setSound(null, null);
            silent.enableVibration(false);
            silent.setDescription("Delivered without sound — used for silent mode and quiet hours.");
            manager.createNotificationChannel(silent);
        }
    }
}
