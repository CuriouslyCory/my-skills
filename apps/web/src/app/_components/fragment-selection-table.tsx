"use client";

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type { RouterOutputs } from "@curiouslycory/api";
import { cn } from "@curiouslycory/ui";
import { Badge } from "@curiouslycory/ui/badge";
import { Button } from "@curiouslycory/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@curiouslycory/ui/card";
import { Checkbox } from "@curiouslycory/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@curiouslycory/ui/table";

import { useTRPC } from "~/trpc/react";

type Artifact = RouterOutputs["artifact"]["list"][number];

function parseTags(tags: string): string[] {
  try {
    return JSON.parse(tags) as string[];
  } catch {
    return [];
  }
}

const columnHelper = createColumnHelper<Artifact>();

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function FragmentSelectionTable() {
  const trpc = useTRPC();
  const { data: artifacts } = useSuspenseQuery(
    trpc.artifact.list.queryOptions({ category: "claudemd" }),
  );

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const columns = [
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={`Select ${row.original.name}`}
        />
      ),
    }),
    columnHelper.accessor("name", {
      header: "Name",
      cell: (info) => (
        <span className="font-medium">{info.getValue()}</span>
      ),
    }),
    columnHelper.accessor("description", {
      header: "Description",
      cell: (info) => (
        <span className="text-muted-foreground line-clamp-1">
          {info.getValue()}
        </span>
      ),
    }),
    columnHelper.accessor("tags", {
      header: "Tags",
      cell: (info) => {
        const tags = parseTags(info.getValue());
        if (tags.length === 0) return null;
        return (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        );
      },
    }),
    columnHelper.accessor("updatedAt", {
      header: "Updated",
      cell: (info) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(info.getValue())}
        </span>
      ),
    }),
  ];

  const table = useReactTable({
    data: artifacts,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const selectedRows = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  return (
    <div className="flex gap-6">
      {/* Data Table */}
      <div className="min-w-0 flex-1">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No claudemd fragments found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Selection Sidebar */}
      <div className="w-72 shrink-0">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Selected ({selectedRows.length})
            </CardTitle>
            {selectedRows.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRowSelection({})}
              >
                Clear all
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {selectedRows.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Select fragments from the table to build your composition.
              </p>
            ) : (
              <ul className="space-y-2">
                {selectedRows.map((artifact) => (
                  <li
                    key={artifact.id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {artifact.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function FragmentSelectionTableSkeleton() {
  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1">
        <div className="rounded-md border">
          <div className="p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-4 py-3",
                  i > 0 && "border-t",
                )}
              >
                <div className="bg-muted h-4 w-4 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-32 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-48 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-20 animate-pulse rounded-sm" />
                <div className="bg-muted h-4 w-20 animate-pulse rounded-sm" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="w-72 shrink-0">
        <Card>
          <CardHeader>
            <div className="bg-muted h-4 w-24 animate-pulse rounded-sm" />
          </CardHeader>
          <CardContent>
            <div className="bg-muted h-4 w-full animate-pulse rounded-sm" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
