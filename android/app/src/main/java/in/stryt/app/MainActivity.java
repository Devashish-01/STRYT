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

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    // On Android 8+ (API 26+) a notification targeting a channel that does not
    // exist is silently dropped by the OS. Create the channel before any push
    // can arrive. Creating an existing channel is a no-op, so this is idempotent.
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "STRYT Notifications",
                    NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
}
