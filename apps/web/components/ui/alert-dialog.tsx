"use client";

import * as React from "react";
import { Button } from "./button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const AlertDialog = Dialog;
const AlertDialogTrigger = DialogTrigger;
const AlertDialogHeader = DialogHeader;
const AlertDialogFooter = DialogFooter;
const AlertDialogTitle = DialogTitle;
const AlertDialogDescription = DialogDescription;

function AlertDialogContent(
  props: React.ComponentProps<typeof DialogContent>,
) {
  return <DialogContent role="alertdialog" showCloseButton={false} {...props} />;
}

function AlertDialogCancel(
  props: React.ComponentProps<typeof Button>,
) {
  return (
    <DialogClose asChild>
      <Button variant="outline" {...props} />
    </DialogClose>
  );
}

export {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
