// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Lang = imports.lang;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Shell = imports.gi.Shell;

const Config = imports.misc.config;
const ExtensionSystem = imports.ui.extensionSystem;
const ExtensionDownloader = imports.ui.extensionDownloader;
const ExtensionUtils = imports.misc.extensionUtils;
const Flashspot = imports.ui.flashspot;
const Main = imports.ui.main;

const GnomeShellIface = <interface name="org.gnome.Shell">
<method name="Eval">
    <arg type="s" direction="in" name="script" />
    <arg type="b" direction="out" name="success" />
    <arg type="s" direction="out" name="result" />
</method>
<method name="ScreenshotArea">
    <arg type="i" direction="in" name="x"/>
    <arg type="i" direction="in" name="y"/>
    <arg type="i" direction="in" name="width"/>
    <arg type="i" direction="in" name="height"/>
    <arg type="b" direction="in" name="flash"/>
    <arg type="s" direction="in" name="filename"/>
    <arg type="b" direction="out" name="success"/>
</method>
<method name="ScreenshotWindow">
    <arg type="b" direction="in" name="include_frame"/>
    <arg type="b" direction="in" name="include_cursor"/>
    <arg type="b" direction="in" name="flash"/>
    <arg type="s" direction="in" name="filename"/>
    <arg type="b" direction="out" name="success"/>
</method>
<method name="Screenshot">
    <arg type="b" direction="in" name="include_cursor"/>
    <arg type="b" direction="in" name="flash"/>
    <arg type="s" direction="in" name="filename"/>
    <arg type="b" direction="out" name="success"/>
</method>
<method name="FlashArea">
    <arg type="i" direction="in" name="x"/>
    <arg type="i" direction="in" name="y"/>
    <arg type="i" direction="in" name="width"/>
    <arg type="i" direction="in" name="height"/>
</method>
<property name="OverviewActive" type="b" access="readwrite" />
<property name="ShellVersion" type="s" access="read" />
</interface>;

const ScreenSaverIface = <interface name="org.gnome.ScreenSaver">
<method name="Lock">
</method>
<method name="GetActive">
    <arg name="active" direction="out" type="b" />
</method>
<method name="SetActive">
    <arg name="value" direction="in" type="b" />
</method>
<method name="GetActiveTime">
    <arg name="value" direction="out" type="u" />
</method>
<signal name="ActiveChanged">
    <arg name="new_value" type="b" />
</signal>
</interface>;

const GnomeShell = new Lang.Class({
    Name: 'GnomeShellDBus',

    _init: function() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(GnomeShellIface, this);
        this._dbusImpl.export(Gio.DBus.session, '/org/gnome/Shell');

        this._extensionsSerivce = new GnomeShellExtensions();
    },

    /**
     * Eval:
     * @code: A string containing JavaScript code
     *
     * This function executes arbitrary code in the main
     * loop, and returns a boolean success and
     * JSON representation of the object as a string.
     *
     * If evaluation completes without throwing an exception,
     * then the return value will be [true, JSON.stringify(result)].
     * If evaluation fails, then the return value will be
     * [false, JSON.stringify(exception)];
     *
     */
    Eval: function(code) {
        if (!global.settings.get_boolean('development-tools'))
            return [false, null];

        let returnValue;
        let success;
        try {
            returnValue = JSON.stringify(eval(code));
            // A hack; DBus doesn't have null/undefined
            if (returnValue == undefined)
                returnValue = '';
            success = true;
        } catch (e) {
            returnValue = JSON.stringify(e);
            success = false;
        }
        return [success, returnValue];
    },

    _onScreenshotComplete: function(obj, result, area, flash, invocation) {
        if (flash && result) {
            let flashspot = new Flashspot.Flashspot(area);
            flashspot.fire();
        }

        let retval = GLib.Variant.new('(b)', [result]);
        invocation.return_value(retval);
    },

    /**
     * ScreenshotArea:
     * @x: The X coordinate of the area
     * @y: The Y coordinate of the area
     * @width: The width of the area
     * @height: The height of the area
     * @flash: Whether to flash the area or not
     * @filename: The filename for the screenshot
     *
     * Takes a screenshot of the passed in area and saves it
     * in @filename as png image, it returns a boolean
     * indicating whether the operation was successful or not.
     *
     */
    ScreenshotAreaAsync : function (params, invocation) {
        let [x, y, width, height, flash, filename, callback] = params;
        let screenshot = new Shell.Screenshot();
        screenshot.screenshot_area (x, y, width, height, filename,
                                Lang.bind(this, this._onScreenshotComplete,
                                          flash, invocation));
    },

    /**
     * ScreenshotWindow:
     * @include_frame: Whether to include the frame or not
     * @include_cursor: Whether to include the cursor image or not
     * @flash: Whether to flash the window area or not
     * @filename: The filename for the screenshot
     *
     * Takes a screenshot of the focused window (optionally omitting the frame)
     * and saves it in @filename as png image, it returns a boolean
     * indicating whether the operation was successful or not.
     *
     */
    ScreenshotWindowAsync : function (params, invocation) {
        let [include_frame, include_cursor, flash, filename] = params;
        let screenshot = new Shell.Screenshot();
        screenshot.screenshot_window (include_frame, include_cursor, filename,
                                  Lang.bind(this, this._onScreenshotComplete,
                                            flash, invocation));
    },

    /**
     * Screenshot:
     * @filename: The filename for the screenshot
     * @include_cursor: Whether to include the cursor image or not
     * @flash: Whether to flash the screen or not
     *
     * Takes a screenshot of the whole screen and saves it
     * in @filename as png image, it returns a boolean
     * indicating whether the operation was successful or not.
     *
     */
    ScreenshotAsync : function (params, invocation) {
        let [include_cursor, flash, filename] = params;
        let screenshot = new Shell.Screenshot();
        screenshot.screenshot(include_cursor, filename,
                          Lang.bind(this, this._onScreenshotComplete,
                                    flash, invocation));
    },

    FlashArea: function(x, y, width, height) {
        let flashspot = new Flashspot.Flashspot({ x : x, y : y, width: width, height: height});
        flashspot.fire();
    },

    get OverviewActive() {
        return Main.overview.visible;
    },

    set OverviewActive(visible) {
        if (visible)
            Main.overview.show();
        else
            Main.overview.hide();
    },

    ShellVersion: Config.PACKAGE_VERSION
});

const GnomeShellExtensionsIface = <interface name="org.gnome.Shell.Extensions">
<method name="ListExtensions">
    <arg type="a{sa{sv}}" direction="out" name="extensions" />
</method>
<method name="GetExtensionInfo">
    <arg type="s" direction="in" name="extension" />
    <arg type="a{sv}" direction="out" name="info" />
</method>
<method name="GetExtensionErrors">
    <arg type="s" direction="in" name="extension" />
    <arg type="as" direction="out" name="errors" />
</method>
<signal name="ExtensionStatusChanged">
    <arg type="s" name="uuid"/>
    <arg type="i" name="state"/>
    <arg type="s" name="error"/>
</signal>
<method name="InstallRemoteExtension">
    <arg type="s" direction="in" name="uuid"/>
    <arg type="s" direction="out" name="result"/>
</method>
<method name="UninstallExtension">
    <arg type="s" direction="in" name="uuid"/>
    <arg type="b" direction="out" name="success"/>
</method>
<method name="LaunchExtensionPrefs">
    <arg type="s" direction="in" name="uuid"/>
</method>
<method name="ReloadExtension">
    <arg type="s" direction="in" name="uuid"/>
</method>
<method name="CheckForUpdates">
</method>
<property name="ShellVersion" type="s" access="read" />
</interface>;

const GnomeShellExtensions = new Lang.Class({
    Name: 'GnomeShellExtensionsDBus',

    _init: function() {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(GnomeShellExtensionsIface, this);
        this._dbusImpl.export(Gio.DBus.session, '/org/gnome/Shell');
        ExtensionSystem.connect('extension-state-changed',
                                Lang.bind(this, this._extensionStateChanged));
    },


    ListExtensions: function() {
        let out = {};
        for (let uuid in ExtensionUtils.extensions) {
            let dbusObj = this.GetExtensionInfo(uuid);
            out[uuid] = dbusObj;
        }
        return out;
    },

    GetExtensionInfo: function(uuid) {
        let extension = ExtensionUtils.extensions[uuid];
        if (!extension)
            return {};

        let obj = {};
        Lang.copyProperties(extension.metadata, obj);

        // Only serialize the properties that we actually need.
        const serializedProperties = ["type", "state", "path", "error", "hasPrefs"];

        serializedProperties.forEach(function(prop) {
            obj[prop] = extension[prop];
        });

        let out = {};
        for (let key in obj) {
            let val = obj[key];
            let type;
            switch (typeof val) {
            case 'string':
                type = 's';
                break;
            case 'number':
                type = 'd';
                break;
            case 'boolean':
                type = 'b';
                break;
            default:
                continue;
            }
            out[key] = GLib.Variant.new(type, val);
        }

        return out;
    },

    GetExtensionErrors: function(uuid) {
        let extension = ExtensionUtils.extensions[uuid];
        if (!extension)
            return [];

        if (!extension.errors)
            return [];

        return extension.errors;
    },

    InstallRemoteExtensionAsync: function([uuid], invocation) {
        return ExtensionDownloader.installExtension(uuid, invocation);
    },

    UninstallExtension: function(uuid) {
        return ExtensionDownloader.uninstallExtension(uuid);
    },

    LaunchExtensionPrefs: function(uuid) {
        let appSys = Shell.AppSystem.get_default();
        let app = appSys.lookup_app('gnome-shell-extension-prefs.desktop');
        app.launch(global.display.get_current_time_roundtrip(),
                   ['extension:///' + uuid], -1, null);
    },

    ReloadExtension: function(uuid) {
        let extension = ExtensionUtils.extensions[uuid];
        if (!extension)
            return;

        ExtensionSystem.reloadExtension(extension);
    },

    CheckForUpdates: function() {
        ExtensionDownloader.checkForUpdates();
    },

    ShellVersion: Config.PACKAGE_VERSION,

    _extensionStateChanged: function(_, newState) {
        this._dbusImpl.emit_signal('ExtensionStatusChanged',
                                   GLib.Variant.new('(sis)', [newState.uuid, newState.state, newState.error]));
    }
});

const ScreenSaverDBus = new Lang.Class({
    Name: 'ScreenSaverDBus',

    _init: function(screenShield) {
        this.parent();

        this._screenShield = screenShield;
        screenShield.connect('lock-status-changed', Lang.bind(this, function(shield) {
            this._dbusImpl.emit_signal('ActiveChanged', GLib.Variant.new('(b)', [shield.locked]));
        }));

        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(ScreenSaverIface, this);
        this._dbusImpl.export(Gio.DBus.session, '/org/gnome/ScreenSaver');

        Gio.DBus.session.own_name('org.gnome.ScreenSaver', Gio.BusNameOwnerFlags.REPLACE, null, null);
    },

    LockAsync: function(parameters, invocation) {
        let tmpId = this._screenShield.connect('lock-screen-shown', Lang.bind(this, function() {
            this._screenShield.disconnect(tmpId);

            invocation.return_value(null);
        }));

        this._screenShield.lock(true);
    },

    SetActive: function(active) {
        if (active)
            this._screenShield.lock(true);
        else
            this._screenShield.unlock();
    },

    GetActive: function() {
        return this._screenShield.locked;
    },

    GetActiveTime: function() {
        let started = this._screenShield.activationTime;
        if (started > 0)
            return Math.floor((GLib.get_monotonic_time() - started) / 1000000);
        else
            return 0;
    },
});
