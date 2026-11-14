$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class DtmDesktopLayout
{
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct POINT { public int X; public int Y; }

    // FindWindowSW takes VARIANT* (not NULL). A zeroed 16-byte VARIANT is an
    // empty VT_EMPTY, which is what SWC_DESKTOP expects for the location.
    [StructLayout(LayoutKind.Explicit, Size = 16)]
    public struct VARIANT { [FieldOffset(0)] public ushort vt; }

    [ComImport, Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39"), ClassInterface(ClassInterfaceType.None)]
    public class ShellWindows { }

    [ComImport, Guid("85CB6900-4D95-11CF-960C-0080C7F4EE85"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellWindows
    {
        // IDispatch slots - never called, but must occupy the first four vtable slots
        [PreserveSig] int GetTypeInfoCount(out uint pctinfo);
        [PreserveSig] int GetTypeInfo(uint iTInfo, uint lcid, out IntPtr ppTInfo);
        [PreserveSig] int GetIDsOfNames(ref Guid riid, IntPtr rgszNames, uint cNames, uint lcid, IntPtr rgDispId);
        [PreserveSig] int Invoke(int dispIdMember, ref Guid riid, uint lcid, ushort wFlags,
                                 IntPtr pDispParams, IntPtr pVarResult, IntPtr pExcepInfo, IntPtr puArgErr);
        // IShellWindows
        [PreserveSig] int get_Count(out int count);
        [PreserveSig] int Item(IntPtr index, out IntPtr ppid);
        [PreserveSig] int _NewEnum(out IntPtr ppunk);
        [PreserveSig] int Register(IntPtr pid, int hwnd, int swClass, int swfwOptions);
        [PreserveSig] int RegisterPending(int lThreadId, IntPtr pvarLoc, IntPtr pvarLocRoot, int swClass,
                                          out int phwnd, int swfwOptions, out IntPtr ppsw);
        [PreserveSig] int Revoke(int lCookie);
        [PreserveSig] int OnNavigate(int lCookie, IntPtr pvarLoc);
        [PreserveSig] int OnActivated(int lCookie, bool fActive);
        [PreserveSig] int FindWindowSW(ref VARIANT pvarLoc, ref VARIANT pvarLocRoot, int swClass,
                                       out int phwnd, int swfwOptions,
                                       [MarshalAs(UnmanagedType.IDispatch)] out object ppdispOut);
        [PreserveSig] int OnCreated(int lCookie, IntPtr punk);
        [PreserveSig] int ProcessAttachDetach(bool fAttach);
    }

    [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IServiceProvider
    {
        [PreserveSig] int QueryService(ref Guid guidService, ref Guid riid, out IntPtr ppvObject);
    }

    [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellBrowser
    {
        // IOleWindow
        [PreserveSig] int GetWindow(out IntPtr phwnd);
        [PreserveSig] int ContextSensitiveHelp(bool fEnterMode);
        // IShellBrowser
        [PreserveSig] int InsertMenusSB(IntPtr hmenuShared, IntPtr lpMenuWidths);
        [PreserveSig] int SetMenuSB(IntPtr hmenuShared, IntPtr holemenuRes, IntPtr hwndActiveObject);
        [PreserveSig] int RemoveMenusSB(IntPtr hmenuShared);
        [PreserveSig] int SetStatusTextSB(IntPtr pszStatusText);
        [PreserveSig] int EnableModelessSB(bool fEnable);
        [PreserveSig] int TranslateAcceleratorSB(IntPtr pmsg, ushort wID);
        [PreserveSig] int BrowseObject(IntPtr pidl, uint wFlags);
        [PreserveSig] int GetViewStateStream(uint grfMode, out IntPtr ppStrm);
        [PreserveSig] int GetControlWindow(uint id, out IntPtr phwnd);
        [PreserveSig] int SendControlMsg(uint id, uint uMsg, IntPtr wParam, IntPtr lParam, out IntPtr pret);
        [PreserveSig] int QueryActiveShellView(out IShellView ppshv);
    }

    [ComImport, Guid("000214E3-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellView
    {
        [PreserveSig] int GetWindow(out IntPtr phwnd);
        [PreserveSig] int ContextSensitiveHelp(bool fEnterMode);
        [PreserveSig] int TranslateAccelerator(IntPtr pmsg);
        [PreserveSig] int EnableModeless(bool fEnable);
        [PreserveSig] int UIActivate(uint uState);
        [PreserveSig] int Refresh();
        [PreserveSig] int CreateViewWindow(IShellView psvPrevious, IntPtr pfs, IShellBrowser psb,
                                           IntPtr prcView, out IntPtr phWnd);
        [PreserveSig] int DestroyViewWindow();
        [PreserveSig] int GetCurrentInfo(IntPtr pfs);
        [PreserveSig] int AddPropertySheetPages(uint dwReserved, IntPtr pfn, IntPtr lparam);
        [PreserveSig] int SaveViewState();
        [PreserveSig] int SelectItem(IntPtr pidlItem, uint uFlags);
        [PreserveSig] int GetItemObject(uint uItem, ref Guid riid, out IntPtr ppv);
    }

    [ComImport, Guid("1af3a467-214f-4298-908e-06b03e0b39f9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFolderView2
    {
        // IFolderView (14 slots, in order)
        [PreserveSig] int GetCurrentViewMode(out uint pViewMode);
        [PreserveSig] int SetCurrentViewMode(uint ViewMode);
        [PreserveSig] int GetFolder(ref Guid riid, out IntPtr ppv);
        [PreserveSig] int Item(int iItemIndex, out IntPtr ppidl);
        [PreserveSig] int ItemCount(uint uFlags, out int pcItems);
        [PreserveSig] int Items(uint uFlags, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetSelectionMarkedItem(out int piItem);
        [PreserveSig] int GetFocusedItem(out int piItem);
        [PreserveSig] int GetItemPosition(IntPtr pidl, out POINT ppt);
        [PreserveSig] int GetSpacing(out POINT ppt);
        [PreserveSig] int GetDefaultSpacing(out POINT ppt);
        [PreserveSig] int GetAutoArrange();
        [PreserveSig] int SelectItem(int iItem, uint dwFlags);
        [PreserveSig] int SelectAndPositionItems(uint cidl, IntPtr apidl, IntPtr apt, uint dwFlags);
        // IFolderView2 up to and including GetItem
        [PreserveSig] int SetGroupBy(IntPtr key, bool fAscending);
        [PreserveSig] int GetGroupBy(IntPtr pkey, out bool pfAscending);
        [PreserveSig] int SetViewProperty(IntPtr pidl, IntPtr propkey, IntPtr propvalue);
        [PreserveSig] int GetViewProperty(IntPtr pidl, IntPtr propkey, out IntPtr ppropvalue);
        [PreserveSig] int SetTileViewProperties(IntPtr pidl, IntPtr pszPropList);
        [PreserveSig] int SetExtendedTileViewProperties(IntPtr pidl, IntPtr pszPropList);
        [PreserveSig] int SetText(uint iType, IntPtr pwszText);
        [PreserveSig] int SetCurrentFolderFlags(uint dwMask, uint dwFlags);
        [PreserveSig] int GetCurrentFolderFlags(out uint pdwFlags);
        [PreserveSig] int GetSortColumnCount(out int pcColumns);
        [PreserveSig] int SetSortColumns(IntPtr rgSortColumns, int cColumns);
        [PreserveSig] int GetSortColumns(IntPtr rgSortColumns, int cColumns);
        [PreserveSig] int GetItem(int iItem, ref Guid riid,
                                  [MarshalAs(UnmanagedType.Interface)] out object ppv);
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem
    {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetParent(out IntPtr ppsi);
        [PreserveSig] int GetDisplayName(uint sigdnName, out IntPtr ppszName);
        [PreserveSig] int GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        [PreserveSig] int Compare(IntPtr psi, uint hint, out int piOrder);
    }

    public static string GetLayoutJson()
    {
        var sw = (IShellWindows)new ShellWindows();
        object disp;
        int hwnd;
        VARIANT loc = new VARIANT();
        VARIANT root = new VARIANT();
        int hr = sw.FindWindowSW(ref loc, ref root, 8 /* SWC_DESKTOP */, out hwnd,
                                 1 /* SWFO_NEEDDISPATCH */, out disp);
        if (hr != 0 || disp == null) throw new COMException("FindWindowSW failed", hr);

        var sp = (IServiceProvider)disp;
        var sidTopLevelBrowser = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");
        var iidShellBrowser   = new Guid("000214E2-0000-0000-C000-000000000046");
        IntPtr pBrowser;
        hr = sp.QueryService(ref sidTopLevelBrowser, ref iidShellBrowser, out pBrowser);
        if (hr != 0) throw new COMException("QueryService failed", hr);
        var browser = (IShellBrowser)Marshal.GetObjectForIUnknown(pBrowser);
        Marshal.Release(pBrowser);

        IShellView view;
        hr = browser.QueryActiveShellView(out view);
        if (hr != 0 || view == null) throw new COMException("QueryActiveShellView failed", hr);

        var fv = (IFolderView2)view;

        int count;
        hr = fv.ItemCount(2 /* SVGIO_ALLVIEW */, out count);
        if (hr != 0) throw new COMException("ItemCount failed", hr);

        POINT spacing;
        fv.GetSpacing(out spacing);
        bool autoArrange = fv.GetAutoArrange() == 0; // S_OK == on

        var iidShellItem = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
        var sb = new StringBuilder(4096);
        sb.Append("{\"autoArrange\":").Append(autoArrange ? "true" : "false");
        sb.Append(",\"spacing\":{\"x\":").Append(spacing.X).Append(",\"y\":").Append(spacing.Y).Append('}');
        sb.Append(",\"count\":").Append(count);
        sb.Append(",\"items\":[");

        bool first = true;
        for (int i = 0; i < count; i++)
        {
            IntPtr pidl;
            if (fv.Item(i, out pidl) != 0 || pidl == IntPtr.Zero) continue;

            POINT pt;
            int posHr = fv.GetItemPosition(pidl, out pt);
            Marshal.FreeCoTaskMem(pidl);            // Item() returns a CoTaskMem PIDL
            if (posHr != 0) continue;

            object itemObj;
            if (fv.GetItem(i, ref iidShellItem, out itemObj) != 0 || itemObj == null) continue;

            IntPtr namePtr;
            if (((IShellItem)itemObj).GetDisplayName(0 /* SIGDN_NORMALDISPLAY */, out namePtr) != 0
                || namePtr == IntPtr.Zero) continue;
            string name = Marshal.PtrToStringUni(namePtr) ?? "";
            Marshal.FreeCoTaskMem(namePtr);

            if (!first) sb.Append(',');
            first = false;
            sb.Append("{\"name\":\"");
            foreach (char c in name)
            {
                if (c == '\\' || c == '"') sb.Append('\\').Append(c);
                else if (c == '\n') sb.Append("\\n");
                else if (c == '\r') sb.Append("\\r");
                else if (c == '\t') sb.Append("\\t");
                else if (c < 0x20)  sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            sb.Append("\",\"x\":").Append(pt.X).Append(",\"y\":").Append(pt.Y).Append('}');
        }

        sb.Append("]}");
        return sb.ToString();
    }
}
'@

[Console]::Out.Write([DtmDesktopLayout]::GetLayoutJson())
