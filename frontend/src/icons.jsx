// Centralized icon registry — all stroke-based SVG from lucide-react.
// Replaces emoji icons for a consistent Flaticon-stroke aesthetic.
import {
  Mic, Users, Home, FolderOpen, BarChart3, Target, ShieldAlert, Brain,
  LineChart, GraduationCap, ShieldCheck, FileText, StickyNote,
  Upload, Clock, User, Calendar, Play, Pause, Search, X, Check, ChevronRight,
  ChevronLeft, Filter, Settings, Bell, Plus, Trash2, Edit, ExternalLink,
  TrendingUp, TrendingDown, AlertTriangle, AlertCircle, Info, CheckCircle2,
  MessageSquare, Send, Paperclip, ArrowRight, ArrowLeft, Download,
  Phone, Volume2, Heart, Pill, ScrollText, Stethoscope, Activity, CircleDollarSign,
  Sparkles, Zap, Trophy, Award, Eye, Quote, Flame, Snowflake, HelpCircle,
  RefreshCw, Loader2, ThumbsUp, ThumbsDown, MoreHorizontal, LayoutDashboard,
  Package, ListChecks, BookOpen, Workflow, Database, Headphones, Star,
  ChevronDown, ChevronUp, Hash, Tag, MapPin, DollarSign, CreditCard,
  Gauge, Lightbulb, PanelLeft, PanelRight
} from 'lucide-react';

const DEFAULT_STROKE = 1.75;

// Default sizing + stroke width override
const wrap = (Icon, size = 18) => (props) => (
  <Icon size={props?.size || size} strokeWidth={props?.strokeWidth || DEFAULT_STROKE} {...props} />
);

// -------- Navigation / Core --------
export const IconAnalyze      = wrap(Mic);
export const IconHome         = wrap(Home);
export const IconHistory      = wrap(FolderOpen);
export const IconCustomers    = wrap(Users);
export const IconCustomer     = wrap(User);
export const IconDashboard    = wrap(LayoutDashboard);
export const IconCoach        = wrap(GraduationCap);
export const IconComplianceQ  = wrap(ShieldCheck);
export const IconMyCalls      = wrap(Phone);
export const IconDraft        = wrap(StickyNote);

// -------- AI Skills --------
export const IconQuality      = wrap(BarChart3);
export const IconOpportunity  = wrap(Target);
export const IconCompliance   = wrap(ShieldAlert);
export const IconMemory       = wrap(Brain);

// -------- Actions --------
export const IconUpload       = wrap(Upload);
export const IconPaperclip    = wrap(Paperclip);
export const IconClock        = wrap(Clock);
export const IconCalendar     = wrap(Calendar);
export const IconSearch       = wrap(Search);
export const IconFilter       = wrap(Filter);
export const IconClose        = wrap(X);
export const IconCheck        = wrap(Check);
export const IconPlus         = wrap(Plus);
export const IconSend         = wrap(Send);
export const IconSettings     = wrap(Settings);
export const IconBell         = wrap(Bell);
export const IconRefresh      = wrap(RefreshCw);
export const IconLoader       = wrap(Loader2);
export const IconExternal     = wrap(ExternalLink);
export const IconArrowRight   = wrap(ArrowRight);
export const IconArrowLeft    = wrap(ArrowLeft);
export const IconMore         = wrap(MoreHorizontal);
export const IconChevronR     = wrap(ChevronRight);
export const IconChevronL     = wrap(ChevronLeft);
export const IconChevronDown  = wrap(ChevronDown);
export const IconChevronUp    = wrap(ChevronUp);
export const IconEdit         = wrap(Edit);
export const IconTrash        = wrap(Trash2);

// -------- States / Severity --------
export const IconAlertTriangle = wrap(AlertTriangle);
export const IconAlert        = wrap(AlertCircle);
export const IconInfo         = wrap(Info);
export const IconSuccess      = wrap(CheckCircle2);
export const IconWarning      = wrap(AlertTriangle);

// -------- Content / domain --------
export const IconChat         = wrap(MessageSquare);
export const IconQuote        = wrap(Quote);
export const IconTranscript   = wrap(FileText);
export const IconSparkles     = wrap(Sparkles);
export const IconTarget       = wrap(Target);
export const IconTrendUp      = wrap(TrendingUp);
export const IconTrendDown    = wrap(TrendingDown);
export const IconFire         = wrap(Flame);
export const IconSnow         = wrap(Snowflake);
export const IconTrophy       = wrap(Trophy);
export const IconAward        = wrap(Award);
export const IconStar         = wrap(Star);
export const IconEye          = wrap(Eye);

// -------- Medical / Pharma --------
export const IconPill         = wrap(Pill);
export const IconStethoscope  = wrap(Stethoscope);
export const IconHeart        = wrap(Heart);
export const IconActivity     = wrap(Activity);

// -------- Sales --------
export const IconMoney        = wrap(CircleDollarSign);
export const IconDollar       = wrap(DollarSign);
export const IconCreditCard   = wrap(CreditCard);
export const IconPackage      = wrap(Package);
export const IconZap          = wrap(Zap);
export const IconGauge        = wrap(Gauge);
export const IconLightbulb    = wrap(Lightbulb);

// -------- Media --------
export const IconPlay         = wrap(Play);
export const IconPause        = wrap(Pause);
export const IconVolume       = wrap(Volume2);
export const IconHeadphones   = wrap(Headphones);
export const IconMic          = wrap(Mic);

// -------- Misc --------
export const IconHash         = wrap(Hash);
export const IconTag          = wrap(Tag);
export const IconMapPin       = wrap(MapPin);
export const IconHelp         = wrap(HelpCircle);
export const IconDatabase     = wrap(Database);
export const IconWorkflow     = wrap(Workflow);
export const IconBook         = wrap(BookOpen);
export const IconList         = wrap(ListChecks);
export const IconPanelLeft    = wrap(PanelLeft);
export const IconPanelRight   = wrap(PanelRight);
export const IconScroll       = wrap(ScrollText);
