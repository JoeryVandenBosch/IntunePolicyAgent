import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Loader2, FileDown, RotateCcw, Upload, Save, Check } from "lucide-react";

export interface PdfBrandingSettings {
  companyName: string;
  department: string;
  contactEmail: string;
  website: string;
  logoDataUrl: string;
  logoPosition: "cover" | "header" | "both";
  preset: "corporate" | "modern" | "minimal";
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  textColor: string;
  fontFamily: "Helvetica" | "Times-Roman" | "Courier";
  headerFontSize: number;
  bodyFontSize: number;
  includeCoverPage: boolean;
  includeHeader: boolean;
  includeFooter: boolean;
  addWatermark: boolean;
  watermarkText: string;
  watermarkOpacity: number;
  includeToc: boolean;
  includeAnalytics: boolean;
  format: "full" | "condensed" | "executive";
  documentTitle: string;
  author: string;
  classification: "Public" | "Internal" | "Confidential" | "Restricted";
}

const STORAGE_KEY = "intunestuff-pdf-branding";

const defaultSettings: PdfBrandingSettings = {
  companyName: "",
  department: "",
  contactEmail: "",
  website: "",
  logoDataUrl: "",
  logoPosition: "cover",
  preset: "corporate",
  primaryColor: "#1a5276",
  secondaryColor: "#5d6d7e",
  accentColor: "#2980b9",
  textColor: "#2c3e50",
  fontFamily: "Helvetica",
  headerFontSize: 13,
  bodyFontSize: 10,
  includeCoverPage: true,
  includeHeader: true,
  includeFooter: true,
  addWatermark: true,
  watermarkText: "CONFIDENTIAL",
  watermarkOpacity: 10,
  includeToc: true,
  includeAnalytics: true,
  format: "condensed",
  documentTitle: "Intune Intelligence Report",
  author: "",
  classification: "Internal",
};

const presetColors = {
  corporate: { primaryColor: "#1a5276", secondaryColor: "#5d6d7e", accentColor: "#2980b9", textColor: "#2c3e50" },
  modern: { primaryColor: "#6b46c1", secondaryColor: "#718096", accentColor: "#d53f8c", textColor: "#2d3748" },
  minimal: { primaryColor: "#000000", secondaryColor: "#666666", accentColor: "#000000", textColor: "#000000" },
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (settings: PdfBrandingSettings) => Promise<void>;
  exporting: boolean;
}

export default function PdfBrandingDialog({ open, onOpenChange, onExport, exporting }: Props) {
  const [settings, setSettings] = useState<PdfBrandingSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) };
    } catch {}
    return { ...defaultSettings };
  });
  const [activeTab, setActiveTab] = useState<"branding" | "appearance" | "pageOptions" | "output">("branding");
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof PdfBrandingSettings>(key: K, value: PdfBrandingSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const applyPreset = (preset: "corporate" | "modern" | "minimal") => {
    setSettings(prev => ({ ...prev, preset, ...presetColors[preset] }));
    setSaved(false);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      update("logoDataUrl", reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const saveSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const resetToDefault = () => {
    setSettings({ ...defaultSettings });
    setActiveTab("branding");
    setSaved(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const tabs = [
    { key: "branding" as const, label: "Branding" },
    { key: "appearance" as const, label: "Appearance" },
    { key: "pageOptions" as const, label: "Page Options" },
    { key: "output" as const, label: "Output" },
  ];

  const ColorPicker = ({ label, colorKey }: { label: string; colorKey: keyof PdfBrandingSettings }) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={settings[colorKey] as string}
          onChange={(e) => update(colorKey, e.target.value)}
          className="w-9 h-9 rounded border border-border cursor-pointer bg-transparent"
          data-testid={`input-pdf-${colorKey}`}
        />
        <Input
          value={settings[colorKey] as string}
          onChange={(e) => update(colorKey, e.target.value)}
          className="font-mono text-sm flex-1"
          data-testid={`input-pdf-${colorKey}-text`}
        />
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="text-lg font-semibold">Export Settings</DialogTitle>
        </DialogHeader>

        <div className="border-b border-border">
          <div className="flex px-6">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`tab-pdf-${tab.key}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {activeTab === "branding" && (
            <>
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold">Organization Details</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Company Name</Label>
                    <Input placeholder="IntuneStuff" value={settings.companyName} onChange={(e) => update("companyName", e.target.value)} data-testid="input-pdf-companyName" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Department</Label>
                    <Input placeholder="IT Department" value={settings.department} onChange={(e) => update("department", e.target.value)} data-testid="input-pdf-department" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Contact Email</Label>
                    <Input placeholder="it@company.com" value={settings.contactEmail} onChange={(e) => update("contactEmail", e.target.value)} data-testid="input-pdf-contactEmail" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Website</Label>
                    <Input placeholder="https://intunestuff.com" value={settings.website} onChange={(e) => update("website", e.target.value)} data-testid="input-pdf-website" />
                  </div>
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold">Logo</h3>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} data-testid="input-pdf-logo-file" />
                    <Button variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} data-testid="button-upload-logo">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload Logo
                    </Button>
                  </div>
                  {settings.logoDataUrl && (
                    <div className="w-14 h-14 rounded border border-border overflow-hidden flex-shrink-0 bg-muted">
                      <img src={settings.logoDataUrl} alt="Logo preview" className="w-full h-full object-contain" />
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Logo Placement</Label>
                  <Select value={settings.logoPosition} onValueChange={(v) => update("logoPosition", v as any)}>
                    <SelectTrigger data-testid="select-pdf-logoPosition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cover">Cover Page Only</SelectItem>
                      <SelectItem value="header">Every Page Header</SelectItem>
                      <SelectItem value="both">Cover Page + Headers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}

          {activeTab === "appearance" && (
            <>
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold">Color Presets</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(["corporate", "modern", "minimal"] as const).map(preset => (
                    <button
                      key={preset}
                      onClick={() => applyPreset(preset)}
                      className={`rounded-lg border p-3 text-center transition-colors ${
                        settings.preset === preset
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                      data-testid={`button-preset-${preset}`}
                    >
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        {Object.values(presetColors[preset]).map((c, i) => (
                          <div key={i} className="w-3.5 h-3.5 rounded-full border border-border/50" style={{ backgroundColor: c }} />
                        ))}
                      </div>
                      <div className="text-xs font-medium capitalize">{preset}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold">Custom Colors</h3>
                <div className="grid grid-cols-2 gap-3">
                  <ColorPicker label="Headings" colorKey="primaryColor" />
                  <ColorPicker label="Subheadings" colorKey="secondaryColor" />
                  <ColorPicker label="Accent / Highlights" colorKey="accentColor" />
                  <ColorPicker label="Body Text" colorKey="textColor" />
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold">Font Settings</h3>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Font Family</Label>
                  <Select value={settings.fontFamily} onValueChange={(v) => update("fontFamily", v as any)}>
                    <SelectTrigger data-testid="select-pdf-fontFamily">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Helvetica">Helvetica (Sans-serif)</SelectItem>
                      <SelectItem value="Times-Roman">Times New Roman (Serif)</SelectItem>
                      <SelectItem value="Courier">Courier (Monospace)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Heading Size: {settings.headerFontSize}pt</Label>
                    <Slider value={[settings.headerFontSize]} onValueChange={([v]) => update("headerFontSize", v)} min={10} max={20} step={1} data-testid="slider-pdf-headerFontSize" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Body Size: {settings.bodyFontSize}pt</Label>
                    <Slider value={[settings.bodyFontSize]} onValueChange={([v]) => update("bodyFontSize", v)} min={8} max={14} step={1} data-testid="slider-pdf-bodyFontSize" />
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === "pageOptions" && (
            <>
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold">Page Elements</h3>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pdf-coverPage"
                      checked={settings.includeCoverPage}
                      onCheckedChange={(c) => update("includeCoverPage", !!c)}
                      data-testid="checkbox-pdf-includeCoverPage"
                    />
                    <Label htmlFor="pdf-coverPage" className="text-sm cursor-pointer">Include cover page</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pdf-header"
                      checked={settings.includeHeader}
                      onCheckedChange={(c) => update("includeHeader", !!c)}
                      data-testid="checkbox-pdf-includeHeader"
                    />
                    <Label htmlFor="pdf-header" className="text-sm cursor-pointer">Show page headers</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pdf-footer"
                      checked={settings.includeFooter}
                      onCheckedChange={(c) => update("includeFooter", !!c)}
                      data-testid="checkbox-pdf-includeFooter"
                    />
                    <Label htmlFor="pdf-footer" className="text-sm cursor-pointer">Show page footers with page numbers</Label>
                  </div>
                </div>
              </div>
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="text-sm font-semibold">Watermark</h3>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pdf-watermark"
                    checked={settings.addWatermark}
                    onCheckedChange={(c) => update("addWatermark", !!c)}
                    data-testid="checkbox-pdf-addWatermark"
                  />
                  <Label htmlFor="pdf-watermark" className="text-sm cursor-pointer">Add diagonal watermark</Label>
                </div>
                {settings.addWatermark && (
                  <div className="space-y-3 pl-6">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Watermark Text</Label>
                      <Input
                        placeholder="CONFIDENTIAL"
                        value={settings.watermarkText}
                        onChange={(e) => update("watermarkText", e.target.value)}
                        data-testid="input-pdf-watermarkText"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Visibility: {settings.watermarkOpacity}%</Label>
                      <Slider
                        value={[settings.watermarkOpacity]}
                        onValueChange={([v]) => update("watermarkOpacity", v)}
                        min={5}
                        max={50}
                        step={5}
                        data-testid="slider-pdf-watermarkOpacity"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "output" && (
            <div className="border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold">Report Configuration</h3>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Report Title</Label>
                <Input
                  placeholder="Intune Intelligence Report"
                  value={settings.documentTitle}
                  onChange={(e) => update("documentTitle", e.target.value)}
                  data-testid="input-pdf-documentTitle"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Author</Label>
                  <Input
                    placeholder="IT Department"
                    value={settings.author}
                    onChange={(e) => update("author", e.target.value)}
                    data-testid="input-pdf-author"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Classification</Label>
                  <Select value={settings.classification} onValueChange={(v) => update("classification", v as any)}>
                    <SelectTrigger data-testid="select-pdf-classification">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Public">Public</SelectItem>
                      <SelectItem value="Internal">Internal</SelectItem>
                      <SelectItem value="Confidential">Confidential</SelectItem>
                      <SelectItem value="Restricted">Restricted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Detail Level</Label>
                <Select value={settings.format} onValueChange={(v) => update("format", v as any)}>
                  <SelectTrigger data-testid="select-pdf-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Report (all sections)</SelectItem>
                    <SelectItem value="condensed">Condensed (key findings only)</SelectItem>
                    <SelectItem value="executive">Executive Summary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t border-border pt-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pdf-toc"
                    checked={settings.includeToc}
                    onCheckedChange={(c) => update("includeToc", !!c)}
                    data-testid="checkbox-pdf-includeToc"
                  />
                  <Label htmlFor="pdf-toc" className="text-sm cursor-pointer">Include table of contents</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pdf-analytics"
                    checked={settings.includeAnalytics}
                    onCheckedChange={(c) => update("includeAnalytics", !!c)}
                    data-testid="checkbox-pdf-includeAnalytics"
                  />
                  <Label htmlFor="pdf-analytics" className="text-sm cursor-pointer">Include overview statistics</Label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-6 py-3 flex items-center justify-between bg-card">
          <Button variant="ghost" size="sm" onClick={resetToDefault} data-testid="button-pdf-reset">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Reset
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} data-testid="button-pdf-cancel">
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={saveSettings} data-testid="button-pdf-save">
              {saved ? (
                <><Check className="w-3.5 h-3.5 mr-1.5" /> Saved</>
              ) : (
                <><Save className="w-3.5 h-3.5 mr-1.5" /> Save Settings</>
              )}
            </Button>
            <Button size="sm" onClick={() => onExport(settings)} disabled={exporting} data-testid="button-generate-pdf">
              {exporting ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Generating...</>
              ) : (
                <><FileDown className="w-3.5 h-3.5 mr-1.5" /> Generate PDF</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
