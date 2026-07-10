const iconSrc = (path) => encodeURI(`${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`);

const makeAssetIcon = (path, alt = '') => {
  const src = iconSrc(path);
  return function AssetIcon({ size, className = '', style = {}, color, ...props }) {
    const resolvedSize = size ?? (className ? undefined : 16);
    return (
      <img
        src={src}
        alt={alt}
        aria-hidden={alt ? undefined : true}
        className={className}
        width={resolvedSize}
        height={resolvedSize}
        draggable="false"
        style={{
          ...(resolvedSize ? { width: resolvedSize, height: resolvedSize } : {}),
          display: 'inline-block',
          objectFit: 'contain',
          verticalAlign: '-0.125em',
          flexShrink: 0,
          ...style,
        }}
        {...props}
      />
    );
  };
};

export const IconEmpty = () => null;
export const EmptyIcon = IconEmpty;

export const IconActive = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Active/SVG/Active_20px.svg');
export const IconActivity = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Real-Time Data/SVG/Real-Time Data_20px.svg');
export const IconAlertCircle = makeAssetIcon('/All Icons Zipped/06 Alarms, Events & Status/Alert/SVG/Alert_20px.svg');
export const IconAlertTriangle = makeAssetIcon('/All Icons Zipped/06 Alarms, Events & Status/Warning/SVG/Warning_20px.svg');
export const IconArrowDown = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Vertical Align Bottom/SVG/Vertical Align Bottom_20px.svg');
export const IconArrowLeft = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Back/SVG/Back_20px.svg');
export const IconArrowUp = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Vertical Align Top/SVG/Vertical Align Top_20px.svg');
export const IconArrowUpRight = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Overview/SVG/Overview_20px.svg', 'View details');
export const IconAward = EmptyIcon;
export const IconBarChart2 = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Bar Chart/SVG/Bar Chart_20px.svg');
export const IconAlignCenter = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Horizontal Align Center/SVG/Horizontal Align Center_20px.svg');
export const IconAlignJustify = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Distribute Horizontally/SVG/Distribute Horizontally_20px.svg');
export const IconAlignLeft = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Horizontal Align Left/SVG/Horizontal Align Left_20px.svg');
export const IconAlignRight = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Horizontal Align Right/SVG/Horizontal Align Right_20px.svg');
export const IconBold = EmptyIcon;
export const IconBox = EmptyIcon;
export const IconBuilding = EmptyIcon;
export const IconBriefcase = EmptyIcon;
export const IconCalendar = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Schedule/SVG/Schedule_20px.svg');
export const IconCheckSquare = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Success/SVG/Success_20px.svg');
export const IconChevronDown = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Collapse/SVG/Collapse_20px.svg');
export const IconChevronLeft = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Back/SVG/Back_20px.svg');
export const IconChevronRight = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Expand/SVG/Expand_20px.svg');
export const IconCheck = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Success/SVG/Success_20px.svg');
export const IconCheckCircle = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Success/SVG/Success_20px.svg');
export const IconClipboard = EmptyIcon;
export const IconColumns = EmptyIcon;
export const IconCircle = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Online/SVG/Online_20px.svg');
export const IconClock = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Timer/SVG/Timer_20px.svg');
export const IconCopy = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Copy/SVG/Copy_20px.svg');
export const IconCrosshair = makeAssetIcon('/All Icons Zipped/11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg');
export const IconDownload = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Download Document/SVG/Download Document_20px.svg');
export const IconDroplet = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Pump/SVG/Pump_20px.svg');
export const IconDollarSign = EmptyIcon;
export const IconDistributionNetwork = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Distribution Network/SVG/Distribution Network_20px.svg');
export const IconEdit2 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Edit/SVG/Edit_20px.svg');
export const IconEdit3 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Edit/SVG/Edit_20px.svg');
export const IconEye = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Active/SVG/Active_20px.svg');
export const IconEyeOff = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Inactive/SVG/Inactive_20px.svg');
export const IconFile = makeAssetIcon('/All Icons Zipped/12 File & Document Management/File/SVG/File_20px.svg');
export const IconFileText = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Document/SVG/Document_20px.svg');
export const IconFilter = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Filter/SVG/Filter_20px.svg');
export const IconFolder = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Folder/SVG/Folder_20px.svg');
export const IconGitBranch = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Pipe/SVG/Pipe_20px.svg');
export const IconGrid = EmptyIcon;
export const IconHash = EmptyIcon;
export const IconHelpCircle = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Help - Support/SVG/Help - Support_20px.svg');
export const IconHome = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Home/SVG/Home_20px.svg');
export const IconInfo = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Help - Support/SVG/Help - Support_20px.svg');
export const IconIndustry = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Control Panel/SVG/Control Panel_20px.svg');
export const IconInactive = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Inactive/SVG/Inactive_20px.svg');
export const IconItalic = EmptyIcon;
export const IconKaaba = EmptyIcon;
export const IconKey = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Permissions/SVG/Permissions_20px.svg');
export const IconLayers = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Overview/SVG/Overview_20px.svg');
export const IconList = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Document/SVG/Document_20px.svg');
export const IconLoader = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Refresh/SVG/Refresh_20px.svg');
export const IconMail = EmptyIcon;
export const IconMap = makeAssetIcon('/All Icons Zipped/11 Map & Location (GIS)/Map/SVG/Map_20px.svg');
export const IconMapPin = makeAssetIcon('/All Icons Zipped/11 Map & Location (GIS)/Location Pin/SVG/Location Pin_20px.svg');
export const IconMaximize = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Expand/SVG/Expand_20px.svg');
export const IconMaximize2 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Expand/SVG/Expand_20px.svg');
export const IconMinimize2 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Collapse/SVG/Collapse_20px.svg');
export const IconMinus = EmptyIcon;
export const IconMoon = EmptyIcon;
export const IconPackage = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Folder/SVG/Folder_20px.svg');
export const IconPercent = EmptyIcon;
export const IconPipe = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Pipe/SVG/Pipe_20px.svg');
export const IconPipelineNetwork = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Pipeline Network/SVG/Pipeline Network_20px.svg');
export const IconPlant = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Desalination Plant/SVG/Desalination Plant_20px.svg');
export const IconPlay = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Start/SVG/Start_20px.svg');
export const IconPlus = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Add/SVG/Add_20px.svg');
export const IconPlusCircle = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Add/SVG/Add_20px.svg');
export const IconPrinter = EmptyIcon;
export const IconRefresh = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Refresh/SVG/Refresh_20px.svg');
export const IconRefreshCw = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Refresh/SVG/Refresh_20px.svg');
export const IconReport = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Report/SVG/Report_20px.svg');
export const IconRotateCcw = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Refresh/SVG/Refresh_20px.svg');
export const IconRotateCw = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Refresh/SVG/Refresh_20px.svg');
export const IconSave = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Save/SVG/Save_20px.svg');
export const IconScissors = EmptyIcon;
export const IconSearch = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Search/SVG/Search_20px.svg');
export const IconSelect = makeAssetIcon('/All Icons Zipped/00001 To be Organized/Select/SVG/Select_20px.svg');
export const IconSettings = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Settings/SVG/Settings_20px.svg');
export const IconShare2 = EmptyIcon;
export const IconShield = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Permissions/SVG/Permissions_20px.svg');
export const IconSidebar = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Menu/SVG/Menu_20px.svg');
export const IconSquare = EmptyIcon;
export const IconStop = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Stop/SVG/Stop_20px.svg');
export const IconStorageTank = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Storage Tank/SVG/Storage Tank_20px.svg');
export const IconTag = EmptyIcon;
export const IconTarget = makeAssetIcon('/All Icons Zipped/11 Map & Location (GIS)/Asset Location/SVG/Asset Location_20px.svg');
export const IconTreatmentPlant = makeAssetIcon('/All Icons Zipped/02 Asset & Infrastructure Icons/Treatment Plant/SVG/Treatment Plant_20px.svg');
export const IconTint = EmptyIcon;
export const IconTrash2 = makeAssetIcon('/All Icons Zipped/15 UI Utility Icons (System-Level)/Delete-Trash/SVG/Delete-Trash_20px.svg');
export const IconTrendingDown = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Line Chart/SVG/Line Chart_20px.svg');
export const IconTrendingUp = makeAssetIcon('/All Icons Zipped/05 Data, Analytics & Reporting/Trends/SVG/Trends_20px.svg');
export const IconTruck = EmptyIcon;
export const IconUmbrellaBeach = EmptyIcon;
export const IconUpload = makeAssetIcon('/All Icons Zipped/12 File & Document Management/Upload Document/SVG/Upload Document_20px.svg');
export const IconUnderline = EmptyIcon;
export const IconUser = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/User/SVG/User_20px.svg');
export const IconUsers = makeAssetIcon('/All Icons Zipped/01 Core Navigation-System/Users_Roles/SVG/Users_Roles_20px.svg');
export const IconX = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Error/SVG/Error_20px.svg');
// Text-based "x" glyph for cancel/close affordances - avoids the error/caution
// asset reading as an alert. Accepts the same `size` prop as the asset icons.
export const IconXText = ({ size = 16, className = '', style = {}, color, ...props }) => (
  <span
    aria-hidden="true"
    className={className}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: size,
      height: size,
      fontSize: typeof size === 'number' ? Math.round(size * 0.9) : size,
      lineHeight: 1,
      fontWeight: 600,
      flexShrink: 0,
      ...(color ? { color } : {}),
      ...style,
    }}
    {...props}
  >
    {String.fromCharCode(0x2715)}
  </span>
);
export const IconXCircle = makeAssetIcon('/All Icons Zipped/13 Status & Indicators/Error/SVG/Error_20px.svg');
export const IconZap = makeAssetIcon('/All Icons Zipped/07 Operations & Control/Automatic Mode/SVG/Automatic Mode_20px.svg');

export const ICONS = {
  search: IconSearch,
  home: IconHome,
  help: IconHelpCircle,
};
