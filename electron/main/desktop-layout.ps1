[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$code = @"
using System;
using System.Runtime.InteropServices;

public static class DtmDesktopLayout
{
    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    public struct POINT { public int x; public int y; }

    [ComImport, Guid("6D5140C1-7436-11CE-8034-00AA006009FA"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IServiceProvider
    {
        [PreserveSig] int QueryService(ref Guid guidService, ref Guid riid, out IntPtr ppvObject);
    }

    [ComImport, Guid("000214E2-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellBrowser
    {
        [PreserveSig] int GetWindow(out IntPtr phwnd);
        [PreserveSig] int ContextSensitiveHelp(bool f);
        [PreserveSig] int InsertMenusSB(IntPtr h, IntPtr l);
        [PreserveSig] int SetMenuSB(IntPtr h1, IntPtr h2, IntPtr h3);
        [PreserveSig] int RemoveMenusSB(IntPtr h);
        [PreserveSig] int SetStatusTextSB(IntPtr p);
        [PreserveSig] int EnableModelessSB(bool f);
        [PreserveSig] int TranslateAcceleratorSB(IntPtr p, ushort w);
        [PreserveSig] int BrowseObject(IntPtr pidl, uint flags);
        [PreserveSig] int GetViewStateStream(uint grfMode, out IntPtr ppStrm);
        [PreserveSig] int GetControlWindow(uint id, out IntPtr phwnd);
        [PreserveSig] int SendControlMsg(uint id, uint msg, IntPtr wp, IntPtr lp, out IntPtr ret);
        [PreserveSig] int QueryActiveShellView([MarshalAs(UnmanagedType.IUnknown)] out object ppshv);
    }

    [ComImport, Guid("cde725b0-ccc9-4519-917e-325d72fab4ce"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFolderView
    {
        [PreserveSig] int GetCurrentViewMode(out uint p);
        [PreserveSig] int SetCurrentViewMode(uint v);
        [PreserveSig] int GetFolder(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int Item(int i, out IntPtr ppidl);
        [PreserveSig] int ItemCount(uint f, out int c);
        [PreserveSig] int Items(uint f, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int GetSelectionMarkedItem(out int i);
        [PreserveSig] int GetFocusedItem(out int i);
        [PreserveSig] int GetItemPosition(IntPtr pidl, out POINT ppt);
        [PreserveSig] int GetSpacing(out POINT ppt);
        [PreserveSig] int GetDefaultSpacing(out POINT ppt);
        [PreserveSig] int GetAutoArrange();
        [PreserveSig] int SelectItem(int i, uint f);
        [PreserveSig] int SelectAndPositionItems(uint cidl, IntPtr apidl, IntPtr apt, uint f);
    }

    [ComImport, Guid("1af3a467-214f-4298-908e-06b03e0b39f9"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IFolderView2
    {
        [PreserveSig] int GetCurrentViewMode(out uint p);
        [PreserveSig] int SetCurrentViewMode(uint v);
        [PreserveSig] int GetFolder(ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int Item(int i, out IntPtr ppidl);
        [PreserveSig] int ItemCount(uint f, out int c);
        [PreserveSig] int Items(uint f, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
        [PreserveSig] int GetSelectionMarkedItem(out int i);
        [PreserveSig] int GetFocusedItem(out int i);
        [PreserveSig] int GetItemPosition(IntPtr pidl, out POINT ppt);
        [PreserveSig] int GetSpacing(out POINT ppt);
        [PreserveSig] int GetDefaultSpacing(out POINT ppt);
        [PreserveSig] int GetAutoArrange();
        [PreserveSig] int SelectItem(int i, uint f);
        [PreserveSig] int SelectAndPositionItems(uint cidl, IntPtr apidl, IntPtr apt, uint f);
        [PreserveSig] int SetGroupBy(IntPtr key, bool asc);
        [PreserveSig] int GetGroupBy(IntPtr key, out bool asc);
        [PreserveSig] int SetViewProperty(IntPtr pidl, IntPtr key, IntPtr prop);
        [PreserveSig] int GetViewProperty(IntPtr pidl, IntPtr key, out IntPtr prop);
        [PreserveSig] int SetTileViewProperties(IntPtr pidl, IntPtr list);
        [PreserveSig] int SetExtendedTileViewProperties(IntPtr pidl, IntPtr list);
        [PreserveSig] int SetText(uint t, IntPtr text);
        [PreserveSig] int SetCurrentFolderFlags(uint mask, uint flags);
        [PreserveSig] int GetCurrentFolderFlags(out uint flags);
        [PreserveSig] int GetSortColumnCount(out int count);
        [PreserveSig] int SetSortColumns(IntPtr cols, int count);
        [PreserveSig] int GetSortColumns(IntPtr cols, int count);
        [PreserveSig] int GetItem(int index, ref Guid riid, [MarshalAs(UnmanagedType.IUnknown)] out object ppv);
    }

    [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IShellItem
    {
        [PreserveSig] int BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        [PreserveSig] int GetParent(out IntPtr ppsi);
        [PreserveSig] int GetDisplayName(uint sigdn, out IntPtr ppszName);
        [PreserveSig] int GetAttributes(uint mask, out uint attrs);
        [PreserveSig] int Compare(IntPtr psi, uint hint, out int order);
    }

    static IFolderView2 GetView()
    {
        Guid clsid = new Guid("9BA05972-F6A8-11CF-A442-00A0C90A8F39");
        object sw = Activator.CreateInstance(Type.GetTypeFromCLSID(clsid, true));
        object[] args = new object[] { 0, 0, 8, 0, 1 };
        object disp = sw.GetType().InvokeMember("FindWindowSW", System.Reflection.BindingFlags.InvokeMethod, null, sw, args);
        if (disp == null) throw new InvalidOperationException("desktop shell not found");

        IServiceProvider sp = (IServiceProvider)disp;
        Guid sid = new Guid("4C96BE40-915C-11CF-99D3-00AA004AE837");
        Guid iidBrowser = new Guid("000214E2-0000-0000-C000-000000000046");
        IntPtr pBrowser;
        int hr = sp.QueryService(ref sid, ref iidBrowser, out pBrowser);
        if (hr != 0 || pBrowser == IntPtr.Zero) throw new COMException("QueryService failed", hr);
        IShellBrowser browser = (IShellBrowser)Marshal.GetObjectForIUnknown(pBrowser);
        Marshal.Release(pBrowser);

        object view;
        hr = browser.QueryActiveShellView(out view);
        if (hr != 0 || view == null) throw new COMException("QueryActiveShellView failed", hr);

        Guid iidFV2 = new Guid("1af3a467-214f-4298-908e-06b03e0b39f9");
        IntPtr pUnk = Marshal.GetIUnknownForObject(view);
        IntPtr pFV2;
        hr = Marshal.QueryInterface(pUnk, ref iidFV2, out pFV2);
        Marshal.Release(pUnk);
        if (hr != 0 || pFV2 == IntPtr.Zero) throw new COMException("QueryInterface failed", hr);
        IFolderView2 fv2 = (IFolderView2)Marshal.GetObjectForIUnknown(pFV2);
        Marshal.Release(pFV2);
        return fv2;
    }

    public static string GetJson()
    {
        IFolderView2 view = GetView();
        int count;
        view.ItemCount(0, out count);
        POINT spacing;
        view.GetSpacing(out spacing);
        bool autoArrange = view.GetAutoArrange() == 0;

        string items = "";
        for (int i = 0; i < count; i++)
        {
            IntPtr pidl;
            if (view.Item(i, out pidl) != 0 || pidl == IntPtr.Zero) continue;
            POINT pt;
            view.GetItemPosition(pidl, out pt);
            Marshal.FreeCoTaskMem(pidl);

            string name = "";
            try
            {
                Guid iidItem = new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe");
                object item;
                if (view.GetItem(i, ref iidItem, out item) == 0 && item != null)
                {
                    IntPtr psz;
                    IShellItem si = (IShellItem)item;
                    if (si.GetDisplayName(0, out psz) == 0 && psz != IntPtr.Zero)
                    {
                        name = Marshal.PtrToStringUni(psz);
                        Marshal.FreeCoTaskMem(psz);
                    }
                    Marshal.ReleaseComObject(item);
                }
            }
            catch { }

            string esc = name.Replace("\\", "\\\\").Replace("\"", "\\\"");
            if (items.Length > 0) items += ",";
            items += "{\"name\":\"" + esc + "\",\"x\":" + pt.x + ",\"y\":" + pt.y + "}";
        }

        return "{\"autoArrange\":" + (autoArrange ? "true" : "false") +
               ",\"spacing\":{\"x\":" + spacing.x + ",\"y\":" + spacing.y + "}" +
               ",\"items\":[" + items + "]}";
    }
}
"@

Add-Type -TypeDefinition $code
[DtmDesktopLayout]::GetJson()
