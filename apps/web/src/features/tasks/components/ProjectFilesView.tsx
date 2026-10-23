import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileArchive,
  File,
  Download,
  Eye,
  Upload,
  Search,
  ExternalLink,
  X,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from '../../../i18n/locale';
import type { Task } from '../types';
import { getProjectFilesFromStorage, appendProjectFileToStorage } from '../utils/fileStorage';

interface ProjectFilesViewProps {
  tasks: Task[];
  activeProjectId: string | null;
  onSelectTask: (task: Task) => void;
}

export interface ExtractedFile {
  id: string;
  name: string;
  url: string;
  fileType: 'image' | 'pdf' | 'document' | 'archive' | 'other';
  task?: Task;
  uploadedAt: string;
  size?: string;
}

export const ProjectFilesView: React.FC<ProjectFilesViewProps> = ({
  tasks,
  activeProjectId,
  onSelectTask,
}) => {
  const t = useTranslation();
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'image' | 'pdf' | 'document' | 'archive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<ExtractedFile | null>(null);

  // Local uploaded project files state (for direct project-level uploads)
  const [directFiles, setDirectFiles] = useState<ExtractedFile[]>(() => {
    if (!activeProjectId) return [];
    try {
      const stored = localStorage.getItem(`project_files_${activeProjectId}`);
      return stored ? JSON.parse(stored) : [];
    } catch (err) {
      console.warn('Failed to parse cached project files from localStorage:', err);
      return [];
    }
  });

  // Load project files asynchronously from IndexedDB with fallback
  useEffect(() => {
    let isMounted = true;
    if (activeProjectId) {
      getProjectFilesFromStorage(activeProjectId)
        .then((stored) => {
          if (isMounted) {
            setDirectFiles(stored);
          }
        })
        .catch((err) => {
          console.error('Failed to load project files from storage:', err);
        });
    } else {
      setDirectFiles([]);
    }
    return () => {
      isMounted = false;
    };
  }, [activeProjectId]);

  // Extract all files from task comments and attachments
  const allFiles = useMemo(() => {
    const list: ExtractedFile[] = [...directFiles];

    tasks.forEach((task) => {
      // 1. Comments with attachments
      if (task.comments && Array.isArray(task.comments)) {
        task.comments.forEach((comment) => {
          if (comment.attached_file_url) {
            const url = comment.attached_file_url;
            const filename = url.split('/').pop()?.split('?')[0] || `file_${comment.id}`;
            const ext = filename.split('.').pop()?.toLowerCase() || '';

            let fileType: ExtractedFile['fileType'] = 'other';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) fileType = 'image';
            else if (ext === 'pdf') fileType = 'pdf';
            else if (['doc', 'docx', 'txt', 'md', 'xls', 'xlsx'].includes(ext)) fileType = 'document';
            else if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) fileType = 'archive';

            list.push({
              id: `comment_${comment.id}`,
              name: decodeURIComponent(filename),
              url,
              fileType,
              task,
              uploadedAt: comment.created_at || new Date().toISOString(),
              size: '1.2 MB',
            });
          }
        });
      }
    });

    return list;
  }, [tasks, directFiles]);

  const filteredFiles = useMemo(() => {
    let result = allFiles;
    if (selectedFilter !== 'all') {
      result = result.filter((f) => f.fileType === selectedFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.task?.title.toLowerCase().includes(q) ||
          f.task?.key?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [allFiles, selectedFilter, searchQuery]);

  const handleDirectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    let fileType: ExtractedFile['fileType'] = 'other';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) fileType = 'image';
    else if (ext === 'pdf') fileType = 'pdf';
    else if (['doc', 'docx', 'txt', 'md'].includes(ext)) fileType = 'document';
    else if (['zip', 'rar', '7z'].includes(ext)) fileType = 'archive';

    const reader = new FileReader();
    reader.onload = async () => {
      const newFile: ExtractedFile = {
        id: `direct_${Date.now()}`,
        name: file.name,
        url: reader.result as string,
        fileType,
        uploadedAt: new Date().toISOString(),
        size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      };

      try {
        const updated = await appendProjectFileToStorage(activeProjectId, newFile);
        setDirectFiles(updated);
        toast.success(t('فایل با موفقیت به پروژه اضافه شد'));
      } catch (err) {
        console.error('Failed to store uploaded file:', err);
        toast.error(t('خطا در ذخیره فایل'));
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const renderFileIcon = (type: ExtractedFile['fileType']) => {
    switch (type) {
      case 'image':
        return <ImageIcon size={28} className="text-emerald-500" />;
      case 'pdf':
        return <FileText size={28} className="text-rose-500" />;
      case 'document':
        return <FileText size={28} className="text-blue-500" />;
      case 'archive':
        return <FileArchive size={28} className="text-amber-500" />;
      default:
        return <File size={28} className="text-heledone-ink-muted" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-base-100 overflow-hidden">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 border-b border-base-300/80 bg-base-100 shrink-0">
        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-heledone-ink-muted" />
            <input
              type="text"
              placeholder={t('جستجو در فایل‌ها و اسناد...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-60 ps-8 pe-3 py-1.5 rounded-xl border border-base-300 bg-base-200/50 text-xs focus:bg-base-100 focus:outline-none focus:border-primary transition-all"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-base-200/70 p-0.5 text-xs">
            {[
              { id: 'all', label: t('همه') },
              { id: 'image', label: t('تصاویر') },
              { id: 'pdf', label: t('اسناد PDF') },
              { id: 'archive', label: t('فشرده') },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedFilter(tab.id as any)}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  selectedFilter === tab.id
                    ? 'bg-base-100 text-primary shadow-2xs'
                    : 'text-heledone-ink-muted hover:text-base-content'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload Button */}
        <div>
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-[#006D73] text-white text-xs font-bold transition-all shadow-xs cursor-pointer">
            <Upload size={14} />
            <span>{t('آپلود فایل جدید')}</span>
            <input type="file" onChange={handleDirectUpload} className="hidden" />
          </label>
        </div>
      </div>

      {/* ─── Files Grid ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
        {filteredFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-base-200 grid place-items-center text-heledone-ink-muted mb-3">
              <FolderOpen size={32} />
            </div>
            <h3 className="font-extrabold text-sm text-base-content mb-1">
              {t('هیچ فایلی یافت نشد')}
            </h3>
            <p className="text-xs text-heledone-ink-muted max-w-sm">
              {t('فایل‌های پیوست‌شده در تسک‌ها و فایل‌های آپلود شده در این بخش نمایش داده می‌شوند.')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredFiles.map((file) => {
              const isImage = file.fileType === 'image';

              return (
                <div
                  key={file.id}
                  className="group relative flex flex-col rounded-2xl border border-base-300/80 bg-base-100 hover:border-primary/50 hover:shadow-md transition-all overflow-hidden"
                >
                  {/* File Preview Thumbnail */}
                  <div
                    onClick={() => setPreviewFile(file)}
                    className="relative h-32 w-full bg-base-200/60 grid place-items-center overflow-hidden cursor-pointer"
                  >
                    {isImage ? (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      renderFileIcon(file.fileType)
                    )}

                    {/* Quick Preview Hover Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-200">
                      <span className="p-2 rounded-xl bg-white/90 text-neutral hover:bg-white transition-colors">
                        <Eye size={16} />
                      </span>
                      <a
                        href={file.url}
                        download={file.name}
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-xl bg-white/90 text-neutral hover:bg-white transition-colors"
                      >
                        <Download size={16} />
                      </a>
                    </div>
                  </div>

                  {/* File Metadata */}
                  <div className="p-3 flex flex-col gap-1.5 flex-1 justify-between">
                    <div>
                      <p className="font-bold text-xs text-base-content truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-heledone-ink-muted flex items-center justify-between mt-1">
                        <span>{file.size || '1.0 MB'}</span>
                        <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                      </p>
                    </div>

                    {/* Task Source Link */}
                    {file.task ? (
                      <button
                        type="button"
                        onClick={() => onSelectTask(file.task!)}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline truncate mt-1 text-start"
                        title={`${t('پیوست شده به تسک:')} ${file.task.key || ''} ${file.task.title}`}
                      >
                        <ExternalLink size={11} className="shrink-0" />
                        <span className="truncate">
                          {t('تسک:')} {file.task.key ? `${file.task.key} - ` : ''}{file.task.title}
                        </span>
                      </button>
                    ) : (
                      <span className="text-[10px] font-semibold text-heledone-ink-muted/60 mt-1">
                        {t('فایل عمومی پروژه')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Lightbox Modal Preview ─── */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="relative max-w-4xl w-full max-h-[85vh] bg-base-100 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-base-300">
              <span className="font-extrabold text-sm text-base-content truncate">
                {previewFile.name}
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-base-200 hover:bg-base-300 text-xs font-bold text-base-content transition-colors"
                >
                  <Download size={14} />
                  <span>{t('دانلود')}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-xl hover:bg-base-200 text-heledone-ink-muted"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Media Body */}
            <div className="flex-1 overflow-auto p-4 grid place-items-center bg-base-200/40 min-h-[300px]">
              {previewFile.fileType === 'image' ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[65vh] max-w-full object-contain rounded-xl"
                />
              ) : previewFile.fileType === 'pdf' ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  className="w-full h-[65vh] rounded-xl border border-base-300"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  {renderFileIcon(previewFile.fileType)}
                  <p className="font-bold text-sm text-base-content">{previewFile.name}</p>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-content text-xs font-bold"
                  >
                    <Download size={14} />
                    <span>{t('دانلود فایل')}</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
