import jsPDF from "jspdf";
import { beVietnamProRegular, beVietnamProBold } from "./beVietnamPro";

let registered = false;

/** Đăng ký font Be Vietnam Pro (regular + bold) cho jsPDF. Idempotent. */
export const registerVietnameseFont = (doc: jsPDF) => {
  // jsPDF cache toàn cục theo VFS — chỉ cần đăng ký 1 lần per session
  if (!registered) {
    doc.addFileToVFS("BeVietnamPro-Regular.ttf", beVietnamProRegular);
    doc.addFont("BeVietnamPro-Regular.ttf", "BeVietnamPro", "normal");
    doc.addFileToVFS("BeVietnamPro-Bold.ttf", beVietnamProBold);
    doc.addFont("BeVietnamPro-Bold.ttf", "BeVietnamPro", "bold");
    registered = true;
  } else {
    // Với instance mới, vẫn cần addFont để jsPDF biết font name
    doc.addFileToVFS("BeVietnamPro-Regular.ttf", beVietnamProRegular);
    doc.addFont("BeVietnamPro-Regular.ttf", "BeVietnamPro", "normal");
    doc.addFileToVFS("BeVietnamPro-Bold.ttf", beVietnamProBold);
    doc.addFont("BeVietnamPro-Bold.ttf", "BeVietnamPro", "bold");
  }
  doc.setFont("BeVietnamPro", "normal");
};
