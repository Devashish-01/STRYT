package in.stryt.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Lets the JS layer check/request exemption from Android's battery-optimization
// throttling. Many OEMs (MIUI, Samsung, Oppo/Vivo, OnePlus) suppress background
// FCM delivery (no heads-up alert / sound while backgrounded or locked) unless
// the app is explicitly whitelisted — this is the one piece of that reliability
// gap that's actually fixable in-app rather than left to the user finding it
// buried in Settings themselves.
@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            ret.put("ignoring", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } else {
            ret.put("ignoring", true); // pre-Marshmallow has no battery-optimization concept
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(intent);
            } catch (Exception e) {
                // Some OEM skins (notably MIUI) block this direct-request intent
                // entirely — fall back to the general list so the user can still
                // find and whitelist the app by hand.
                try {
                    getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                } catch (Exception ignored) {
                    // Nothing more we can do without the user navigating Settings manually.
                }
            }
        }
        call.resolve();
    }
}
