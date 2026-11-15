# Desktop Time Machine — real Windows master volume
#
# Reads or sets the default audio endpoint's master volume through
# IAudioEndpointVolume. The COM interop has to live in C# because PowerShell
# cannot cast an RCW to a managed interface (the cast yields __ComObject).
param(
  [ValidateSet('get', 'set')][string]$Action = 'get',
  [double]$Level = -1,
  [string]$Muted = ''
)

$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class DtmAudio {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  public class MMDeviceEnumeratorComObject { }

  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int dwStateMask, out IntPtr ppDevices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
  }

  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IMMDevice {
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
  }

  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, Guid pguidEventContext);
    int GetMute(out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(Guid pguidEventContext);
    int VolumeStepDown(Guid pguidEventContext);
    int QueryHardwareSupport(out uint pdwHardwareSupportMask);
    int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
  }

  static IAudioEndpointVolume Endpoint() {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice device;
    enumerator.GetDefaultAudioEndpoint(0, 1, out device);
    var iid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    object endpoint;
    device.Activate(ref iid, 23, IntPtr.Zero, out endpoint);
    return (IAudioEndpointVolume)endpoint;
  }

  public static float GetLevel() {
    float level;
    Endpoint().GetMasterVolumeLevelScalar(out level);
    return level;
  }

  public static bool GetMute() {
    bool muted;
    Endpoint().GetMute(out muted);
    return muted;
  }

  public static void SetLevel(float level) {
    Endpoint().SetMasterVolumeLevelScalar(level, Guid.Empty);
  }

  public static void SetMute(bool muted) {
    Endpoint().SetMute(muted, Guid.Empty);
  }
}
'@

try {
  if ($Action -eq 'get') {
    $state = @{ level = [Math]::Round([DtmAudio]::GetLevel(), 3); muted = [DtmAudio]::GetMute() }
    $state | ConvertTo-Json -Compress
  } else {
    if ($Level -ge 0) { [DtmAudio]::SetLevel([float]$Level) }
    if ($Muted -eq '1') { [DtmAudio]::SetMute($true) }
    elseif ($Muted -eq '0') { [DtmAudio]::SetMute($false) }
    '{"success":true}'
  }
} catch {
  '{"success":false,"error":"' + ($_.Exception.Message -replace '"', "'") + '"}'
}
