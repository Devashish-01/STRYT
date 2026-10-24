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

// Lets the JS layer check whether Android is throttling the app in the background, and open the
// system's battery-optimisation settings so a delivery rider can exempt it. Many OEMs (MIUI, Samsung,
// Oppo/Vivo, OnePlus) kill background location mid-delivery unless the app is whitelisted.
//
// This deliberately does NOT use ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, which needs the
// REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission — a permission Google Play restricts to a short
// allowlist that delivery tracking is not on. Opening the settings list needs no permission, and the
// rider picks STRYT -> "Don't optimise" themselves.
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
    public void openBatterySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
            } catch (Exception e) {
                // Some OEM skins hide this screen; fall back to the app's own details page, which has a battery entry.
                try {
                    Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    details.setData(Uri.parse("package:" + getContext().getPackageName()));
                    getActivity().startActivity(details);
                } catch (Exception ignored) {
                    // Nothing more we can do without the user navigating Settings manually.
                }
            }
        }
        call.resolve();
    }
}
