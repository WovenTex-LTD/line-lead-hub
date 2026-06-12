import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  type POFilters,
  type POFilterOptions,
  HEALTH_LABELS,
  EX_FACTORY_OPTIONS,
  UPDATED_OPTIONS,
  toggleArrayItem,
} from "./po-filters";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: POFilters;
  onChange: (filters: POFilters) => void;
  options: POFilterOptions;
}

export function POFilterDrawer({ open, onOpenChange, filters, onChange, options }: Props) {
  const handleClearAll = () => {
    onChange({
      buyers: [],
      poNumbers: [],
      styles: [],
      styleOrders: [],
      lines: [],
      units: [],
      floors: [],
      health: [],
      exFactory: null,
      updated: null,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle>Filters</SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground text-xs h-7 px-2"
              onClick={handleClearAll}
            >
              Clear all
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-1">

            {/* Buyer */}
            {options.buyers.length > 0 && (
              <FilterSection
                label="Buyer"
                count={filters.buyers.length}
                searchable
              >
                <CheckboxList
                  options={options.buyers.map((v) => ({ value: v, label: v }))}
                  selected={filters.buyers}
                  onToggle={(v) =>
                    onChange({ ...filters, buyers: toggleArrayItem(filters.buyers, v) })
                  }
                />
              </FilterSection>
            )}

            {/* Order */}
            {options.styleOrders.length > 0 && (
              <FilterSection
                label="Order"
                count={filters.styleOrders.length}
                searchable
              >
                <CheckboxList
                  options={options.styleOrders.map((s) => ({ value: s.id, label: s.label }))}
                  selected={filters.styleOrders}
                  onToggle={(v) =>
                    onChange({ ...filters, styleOrders: toggleArrayItem(filters.styleOrders, v) })
                  }
                />
              </FilterSection>
            )}

            {/* Line */}
            {options.lines.length > 0 && (
              <FilterSection
                label="Line"
                count={filters.lines.length}
              >
                <CheckboxList
                  options={options.lines.map((v) => ({ value: v, label: v }))}
                  selected={filters.lines}
                  onToggle={(v) =>
                    onChange({ ...filters, lines: toggleArrayItem(filters.lines, v) })
                  }
                />
              </FilterSection>
            )}

            {/* Unit */}
            {options.units.length > 0 && (
              <FilterSection
                label="Unit"
                count={filters.units.length}
              >
                <CheckboxList
                  options={options.units.map((v) => ({ value: v, label: v }))}
                  selected={filters.units}
                  onToggle={(v) =>
                    onChange({ ...filters, units: toggleArrayItem(filters.units, v) })
                  }
                />
              </FilterSection>
            )}

            {/* Floor */}
            {options.floors.length > 0 && (
              <FilterSection
                label="Floor"
                count={filters.floors.length}
              >
                <CheckboxList
                  options={options.floors.map((v) => ({ value: v, label: v }))}
                  selected={filters.floors}
                  onToggle={(v) =>
                    onChange({ ...filters, floors: toggleArrayItem(filters.floors, v) })
                  }
                />
              </FilterSection>
            )}

            {/* Style */}
            {options.styles.length > 0 && (
              <FilterSection
                label="Style"
                count={filters.styles.length}
                searchable
              >
                <CheckboxList
                  options={options.styles.map((v) => ({ value: v, label: v }))}
                  selected={filters.styles}
                  onToggle={(v) =>
                    onChange({ ...filters, styles: toggleArrayItem(filters.styles, v) })
                  }
                />
              </FilterSection>
            )}

            {/* PO Number */}
            {options.poNumbers.length > 0 && (
              <FilterSection
                label="PO Number"
                count={filters.poNumbers.length}
                searchable
              >
                <CheckboxList
                  options={options.poNumbers.map((v) => ({ value: v, label: v }))}
                  selected={filters.poNumbers}
                  onToggle={(v) =>
                    onChange({
                      ...filters,
                      poNumbers: toggleArrayItem(filters.poNumbers, v),
                    })
                  }
                />
              </FilterSection>
            )}

            {/* Health */}
            {options.health.length > 0 && (
              <FilterSection
                label="Health"
                count={filters.health.length}
              >
                <CheckboxList
                  options={options.health.map((v) => ({
                    value: v,
                    label: HEALTH_LABELS[v] ?? v,
                  }))}
                  selected={filters.health}
                  onToggle={(v) =>
                    onChange({ ...filters, health: toggleArrayItem(filters.health, v) })
                  }
                />
              </FilterSection>
            )}

            <Separator className="my-2" />

            {/* Ex-Factory */}
            <FilterSection
              label="Ex-Factory"
              count={filters.exFactory ? 1 : 0}
            >
              <div className="space-y-2 pt-1">
                {EX_FACTORY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                  >
                    <input
                      type="radio"
                      name="exFactory"
                      className="accent-primary"
                      checked={filters.exFactory === opt.value}
                      onChange={() =>
                        onChange({
                          ...filters,
                          exFactory:
                            filters.exFactory === opt.value ? null : opt.value,
                        })
                      }
                    />
                    <span className="text-sm">{opt.label}</span>
                    {filters.exFactory === opt.value && (
                      <button
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => onChange({ ...filters, exFactory: null })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </label>
                ))}
              </div>
            </FilterSection>

            {/* Updated */}
            <FilterSection
              label="Updated"
              count={filters.updated ? 1 : 0}
            >
              <div className="space-y-2 pt-1">
                {UPDATED_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                  >
                    <input
                      type="radio"
                      name="updated"
                      className="accent-primary"
                      checked={filters.updated === opt.value}
                      onChange={() =>
                        onChange({
                          ...filters,
                          updated:
                            filters.updated === opt.value ? null : opt.value,
                        })
                      }
                    />
                    <span className="text-sm">{opt.label}</span>
                    {filters.updated === opt.value && (
                      <button
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => onChange({ ...filters, updated: null })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </label>
                ))}
              </div>
            </FilterSection>

          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Internal sub-components ───────────────────────────────────────────────────

interface FilterSectionProps {
  label: string;
  count: number;
  searchable?: boolean;
  children: React.ReactNode;
}

function FilterSection({ label, count, children }: FilterSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between py-2 text-sm font-medium hover:text-foreground text-foreground/80 transition-colors">
          <span className="flex items-center gap-1.5">
            {label}
            {count > 0 && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {count}
              </span>
            )}
          </span>
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pb-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface CheckboxListProps {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  maxVisible?: number;
}

function CheckboxList({ options, selected, onToggle, maxVisible = 8 }: CheckboxListProps) {
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () =>
      search.trim()
        ? options.filter((o) =>
            o.label.toLowerCase().includes(search.trim().toLowerCase())
          )
        : options,
    [options, search]
  );

  const visible = showAll || filtered.length <= maxVisible
    ? filtered
    : filtered.slice(0, maxVisible);

  return (
    <div className="space-y-0.5">
      {options.length > maxVisible && (
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-7 h-7 text-xs"
          />
        </div>
      )}

      {visible.map((opt) => (
        <label
          key={opt.value}
          className="flex items-center gap-2 cursor-pointer rounded px-1 py-1 hover:bg-muted/50 transition-colors"
        >
          <Checkbox
            checked={selected.includes(opt.value)}
            onCheckedChange={() => onToggle(opt.value)}
            className="h-4 w-4 shrink-0"
          />
          <span className="text-sm truncate">{opt.label}</span>
        </label>
      ))}

      {!showAll && filtered.length > maxVisible && (
        <button
          className="text-xs text-muted-foreground hover:text-foreground pl-1 pt-1 transition-colors"
          onClick={() => setShowAll(true)}
        >
          +{filtered.length - maxVisible} more
        </button>
      )}

      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground px-1 py-1">No matches</p>
      )}
    </div>
  );
}
