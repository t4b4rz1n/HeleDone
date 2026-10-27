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
  AtSign,
  Send,
  Trash2,
  UploadCloud,
  FileUp,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage as translateError } from '../../../core/utils/errorHandler';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../../../i18n/locale';
import type { Task } from '../types';
import { MentionTextarea } from '../../../components/MentionTextarea';
import { MentionText } from '../../../components/MentionText';
import { normalizeProjectMembers } from '../../../utils/mentionUtils';
import {
  getProjectFiles,
  uploadProjectFile,
  deleteProjectFile,
  mentionFile,
} from '../../projects/api/projectsApi';

interface ProjectFilesViewProps {
  tasks: Task[];
  activeProjectId: string | null;
  members?: any[];
  targetFileId?: string | null;
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
  description?: string;
  isDirectProjectFile?: boolean;
}

export const ProjectFilesView: React.FC<ProjectFilesViewProps> = ({
  tasks,
  activeProjectId,
  members = [],
  targetFileId,
  onSelectTask,
}) => {
  const t = useTranslation();
  const queryClient = useQueryClient();
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'image' | 'pdf' | 'document' | 'archive'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewFile, setPreviewFile] = useState<ExtractedFile | null>(null);

  // Mention modal state
  const [mentionTargetFile, setMentionTargetFile] = useState<ExtractedFile | null>(null);
  const [mentionMessage, setMentionMessage] = useState('');
  const [isSubmittingMention, setIsSubmittingMention] = useState(false);
  const [highlightedFileId, setHighlightedFileId] = useState<string | null>(null);

  // Upload modal state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Delete modal state
  const [fileToDelete, setFileToDelete] = useState<ExtractedFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Formatted active project members for MentionTextarea
  const formattedMembers = useMemo(() => {
    return normalizeProjectMembers(members).map((user) => ({
      id: user.id,
      username: user.username,
      name: user.displayName,
      avatar: user.avatar,
      is_active: true,
    }));
  }, [members]);

  // Fetch direct project files from PostgreSQL & MinIO
  const { data: serverFiles = [], isError: filesQueryFailed, error: filesQueryError } = useQuery({
    queryKey: ['project-files', activeProjectId],
    queryFn: () => (activeProjectId ? getProjectFiles(activeProjectId) : Promise.resolve([])),
    enabled: !!activeProjectId,
  });

  // Extract all files from project files (PostgreSQL & MinIO) and task comments
  const allFiles = useMemo(() => {
    const list: ExtractedFile[] = (serverFiles || []).map((f) => ({
      id: String(f.id),
      name: f.name,
      url: f.file_url || f.file,
      fileType: f.file_type || 'other',
      uploadedAt: f.created_at,
      size: f.file_size || '1.0 MB',
      description: f.description,
      isDirectProjectFile: true,
    }));

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
              description: comment.content || undefined,
            });
          }
        });
      }
    });

    return list;
  }, [tasks, serverFiles]);

  // Handle direct navigation to target file (e.g. from notification click)
  useEffect(() => {
    if (!targetFileId || allFiles.length === 0) return;

    const target = allFiles.find(
      (f) =>
        String(f.id) === String(targetFileId) ||
        f.name.toLowerCase() === targetFileId.toLowerCase()
    );

    if (target) {
      setSelectedFilter('all');
      setHighlightedFileId(target.id);
      setPreviewFile(target);

      setTimeout(() => {
        const el = document.getElementById(`file-card-${target.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);

      const timer = setTimeout(() => {
        setHighlightedFileId(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [targetFileId, allFiles]);

  const handleSendMention = async () => {
    if (!mentionTargetFile || !mentionMessage.trim() || !activeProjectId) {
      toast.error(t('لطفاً پیام و کاربر مورد نظر را مشخص کنید'));
      return;
    }

    const matches = mentionMessage.match(/@([\w.-]+)/g);
    if (!matches || matches.length === 0) {
      toast.error(t('لطفاً حداقل یک نفر را با علامت @ منشن کنید'));
      return;
    }

    try {
      setIsSubmittingMention(true);
      if (mentionTargetFile.isDirectProjectFile) {
        await mentionFile(activeProjectId, {
          file_id: mentionTargetFile.id,
          file_name: mentionTargetFile.name,
          message: mentionMessage.trim(),
        });
        await queryClient.invalidateQueries({ queryKey: ['project-files', activeProjectId] });
      } else {
        await mentionFile(activeProjectId, {
          file_id: mentionTargetFile.id,
          file_name: mentionTargetFile.name,
          message: mentionMessage,
        });
      }

      // Keep previewFile in sync if this file is currently open in lightbox
      if (previewFile && previewFile.id === mentionTargetFile.id) {
        setPreviewFile({
          ...previewFile,
          description: mentionMessage.trim() || undefined,
        });
      }

      toast.success(t('نوتیفیکیشن منشن با موفقیت ارسال شد'));
      queryClient.invalidateQueries({ queryKey: ['notification-unread'] });
      queryClient.invalidateQueries({ queryKey: ['notification-history'] });
      setMentionTargetFile(null);
      setMentionMessage('');
    } catch (err: any) {
      console.error('Failed to send file mention:', err);
      toast.error(translateError(err, 'خطا در ارسال منشن روی فایل'));
    } finally {
      setIsSubmittingMention(false);
    }
  };

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

  const handleUploadSubmit = async () => {
    if (!uploadFile) {
      toast.error(t('لطفاً ابتدا یک فایل را انتخاب کنید'));
      return;
    }
    if (!activeProjectId) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('name', uploadFile.name);
      if (uploadDescription.trim()) {
        formData.append('description', uploadDescription.trim());
      }

      await uploadProjectFile(activeProjectId, formData);
      await queryClient.invalidateQueries({ queryKey: ['project-files', activeProjectId] });

      if (uploadDescription.includes('@')) {
        queryClient.invalidateQueries({ queryKey: ['notification-unread'] });
        queryClient.invalidateQueries({ queryKey: ['notification-history'] });
        toast.success(t('فایل با موفقیت آپلود شد و اعلان منشن ارسال گردید'));
      } else {
        toast.success(t('فایل با موفقیت به پروژه اضافه شد'));
      }

      setIsUploadModalOpen(false);
      setUploadFile(null);
      setUploadDescription('');
      setUploadPreviewUrl(null);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(translateError(err, 'خطا در ذخیره فایل'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete || !activeProjectId) return;
    try {
      setIsDeleting(true);
      if (fileToDelete.isDirectProjectFile) {
        await deleteProjectFile(activeProjectId, fileToDelete.id);
        await queryClient.invalidateQueries({ queryKey: ['project-files', activeProjectId] });
      }
      if (previewFile?.id === fileToDelete.id) {
        setPreviewFile(null);
      }
      toast.success(t('فایل با موفقیت حذف شد'));
      setFileToDelete(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      toast.error(translateError(err, 'خطا در حذف فایل'));
    } finally {
      setIsDeleting(false);
    }
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
          <button
            type="button"
            onClick={() => {
              setIsUploadModalOpen(true);
              setUploadFile(null);
              setUploadDescription('');
              setUploadPreviewUrl(null);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary hover:bg-[#006D73] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Upload size={14} />
            <span>{t('آپلود فایل جدید')}</span>
          </button>
        </div>
      </div>

      {/* ─── Files Grid ─── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-6">
        {filesQueryFailed ? (
          <div role="alert" className="mx-auto flex min-h-64 max-w-lg flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle size={28} className="text-error" />
            <p className="text-sm font-bold text-base-content">{translateError(filesQueryError, "Could not load project files.")}</p>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['project-files', activeProjectId] })}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-content"
            >
              {t('تلاش دوباره')}
            </button>
          </div>
        ) : filteredFiles.length === 0 ? (
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
                  id={`file-card-${file.id}`}
                  key={file.id}
                  className={`group relative flex flex-col rounded-2xl border bg-base-100 transition-all overflow-hidden ${
                    highlightedFileId === file.id
                      ? 'border-primary ring-4 ring-primary/40 shadow-xl scale-[1.02]'
                      : 'border-base-300/80 hover:border-primary/50 hover:shadow-md'
                  }`}
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
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewFile(file);
                        }}
                        title={t('مشاهده پیش‌نمایش')}
                        className="p-2 rounded-xl bg-white/90 text-neutral hover:bg-white hover:text-primary transition-colors cursor-pointer shadow-sm"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMentionTargetFile(file);
                          setMentionMessage(file.description || '');
                        }}
                        title={t('منشن همکاران روی این فایل')}
                        className="p-2 rounded-xl bg-white/90 text-neutral hover:bg-white hover:text-primary transition-colors cursor-pointer shadow-sm"
                      >
                        <AtSign size={16} />
                      </button>
                      <a
                        href={file.url}
                        download={file.name}
                        onClick={(e) => e.stopPropagation()}
                        title={t('دانلود فایل')}
                        className="p-2 rounded-xl bg-white/90 text-neutral hover:bg-white hover:text-primary transition-colors cursor-pointer shadow-sm"
                      >
                        <Download size={16} />
                      </a>
                      {file.isDirectProjectFile && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFileToDelete(file);
                          }}
                          title={t('حذف فایل')}
                          className="p-2 rounded-xl bg-white/90 text-neutral hover:bg-error hover:text-white transition-colors cursor-pointer shadow-sm"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* File Metadata */}
                  <div className="p-3 flex flex-col gap-1.5 flex-1 justify-between min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-xs text-base-content truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-[10px] text-heledone-ink-muted flex items-center justify-between mt-1">
                        <span>{file.size || '1.0 MB'}</span>
                        <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                      </p>

                      {/* Optional Note/Description */}
                      {file.description && (
                        <div className="text-[11px] text-heledone-ink-muted bg-base-200/50 p-2 rounded-xl border border-base-300/40 mt-1.5 line-clamp-2">
                          <MentionText content={file.description} />
                        </div>
                      )}
                    </div>

                    {/* Task Source Link */}
                    {file.task ? (
                      <button
                        type="button"
                        onClick={() => onSelectTask(file.task!)}
                        className="flex items-center gap-1 text-[11px] font-bold text-primary hover:underline truncate mt-1 text-start min-w-0 w-full"
                        title={`${t('پیوست شده به تسک:')} ${file.task.key || ''} ${file.task.title}`}
                      >
                        <ExternalLink size={11} className="shrink-0" />
                        <span className="truncate min-w-0 flex-1">
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
            className="relative max-w-4xl w-full max-h-[calc(100dvh-2rem)] bg-base-100 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-base-300">
              <span className="font-extrabold text-sm text-base-content truncate">
                {previewFile.name}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMentionTargetFile(previewFile);
                    setMentionMessage(previewFile.description || '');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-colors cursor-pointer"
                  title={t('منشن همکاران روی این فایل')}
                >
                  <AtSign size={14} />
                  <span>{t('منشن')}</span>
                </button>
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-base-200 hover:bg-base-300 text-xs font-bold text-base-content transition-colors cursor-pointer"
                  title={t('دانلود فایل')}
                >
                  <Download size={14} />
                  <span>{t('دانلود')}</span>
                </a>
                {previewFile.isDirectProjectFile && (
                  <button
                    type="button"
                    onClick={() => setFileToDelete(previewFile)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-error/10 hover:bg-error/20 text-error text-xs font-bold transition-colors cursor-pointer"
                    title={t('حذف فایل')}
                  >
                    <Trash2 size={14} />
                    <span>{t('حذف فایل')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="p-1.5 rounded-xl hover:bg-base-200 text-heledone-ink-muted cursor-pointer"
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
                  className="max-h-[60dvh] max-w-full object-contain rounded-xl"
                />
              ) : previewFile.fileType === 'pdf' ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  className="w-full h-[60dvh] rounded-xl border border-base-300"
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

            {/* Modal Description & Mentions Footer */}
            <div className="px-5 py-3 border-t border-base-300 bg-base-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                  <AtSign size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-heledone-ink-muted block uppercase tracking-wider">
                    {t('توضیحات و منشن‌ها:')}
                  </span>
                  {previewFile.description ? (
                    <div className="text-xs text-base-content leading-relaxed mt-0.5">
                      <MentionText content={previewFile.description} />
                    </div>
                  ) : (
                    <span className="text-[11px] text-heledone-ink-muted mt-0.5 block">
                      {t('هنوز توضیحات یا منشنی برای این فایل ثبت نشده است.')}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMentionTargetFile(previewFile);
                  setMentionMessage(previewFile.description || '');
                }}
                className="shrink-0 px-3 py-1.5 rounded-xl bg-base-200 hover:bg-primary/10 hover:text-primary text-xs font-bold text-base-content transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <AtSign size={13} />
                <span>
                  {previewFile.description ? t('ویرایش یا ارسال مجدد') : t('افزودن توضیحات و منشن')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── File Mention Modal ─── */}
      {mentionTargetFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isSubmittingMention) setMentionTargetFile(null);
          }}
        >
          <div
            className="relative max-w-lg w-full bg-base-100 rounded-3xl overflow-hidden shadow-2xl border border-base-300/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-base-300/80 bg-base-200/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary grid place-items-center">
                  <AtSign size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-base-content">
                    {t('منشن همکاران روی فایل')}
                  </h3>
                  <p className="text-[11px] text-heledone-ink-muted truncate max-w-[260px]">
                    {mentionTargetFile.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMentionTargetFile(null)}
                disabled={isSubmittingMention}
                className="p-1.5 rounded-xl hover:bg-base-200 text-heledone-ink-muted transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-4">
              {/* File summary pill */}
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-base-200/50 border border-base-300/60">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-base-100 grid place-items-center shadow-2xs">
                  {renderFileIcon(mentionTargetFile.fileType)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-xs text-base-content truncate">
                    {mentionTargetFile.name}
                  </p>
                  <p className="text-[10px] text-heledone-ink-muted mt-0.5">
                    {mentionTargetFile.size || '1.0 MB'} • {new Date(mentionTargetFile.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Mention Textarea */}
              <div>
                <label className="block text-xs font-bold text-base-content mb-1.5">
                  {t('متن یادداشت و منشن:')}
                </label>
                <MentionTextarea
                  value={mentionMessage}
                  onChange={setMentionMessage}
                  members={formattedMembers}
                  placeholder={t('با تایپ @ نام همکار خود را انتخاب کرده و پیام بگذارید…')}
                  rows={4}
                  className="w-full text-xs p-3 rounded-xl border border-base-300 focus:border-primary bg-base-100 transition-all focus:outline-none"
                />
              </div>

              {/* Quick Member Tags */}
              {formattedMembers.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-heledone-ink-muted">
                    {t('انتخاب سریع اعضا:')}
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                    {formattedMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          const tag = `@${m.username} `;
                          if (!mentionMessage.includes(`@${m.username}`)) {
                            setMentionMessage((prev) => (prev ? `${prev} ${tag}` : tag));
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-200 hover:bg-primary/10 hover:text-primary text-[11px] font-bold text-base-content transition-all cursor-pointer"
                      >
                        <span className="text-primary font-black">@</span>
                        <span>{m.username}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-base-300/80 bg-base-200/30">
              <button
                type="button"
                onClick={() => setMentionTargetFile(null)}
                disabled={isSubmittingMention}
                className="px-4 py-2 rounded-xl border border-base-300 hover:bg-base-200 text-xs font-bold text-base-content transition-colors cursor-pointer"
              >
                {t('انصراف')}
              </button>
              <button
                type="button"
                onClick={handleSendMention}
                disabled={isSubmittingMention || !mentionMessage.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-[#006D73] text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingMention ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Send size={14} />
                )}
                <span>{t('ارسال منشن و اعلان')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ─── Upload & Attach Modal ─── */}
      {isUploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isUploading) setIsUploadModalOpen(false);
          }}
        >
          <div
            className="relative max-w-lg w-full bg-base-100 rounded-3xl overflow-hidden shadow-2xl border border-base-300/80 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-base-300/80 bg-base-200/30">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary grid place-items-center">
                  <FileUp size={18} />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-base-content">
                    {t('آپلود فایل جدید')}
                  </h3>
                  <p className="text-[11px] text-heledone-ink-muted">
                    {t('فایل خود را انتخاب کنید و در صورت تمایل توضیحات و منشن اضافه نمایید.')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                disabled={isUploading}
                className="p-1.5 rounded-xl hover:bg-base-200 text-heledone-ink-muted transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex flex-col gap-4">
              {/* File Dropzone / Selected Preview */}
              {!uploadFile ? (
                <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed border-base-300 hover:border-primary/60 bg-base-200/30 hover:bg-base-200/60 transition-all cursor-pointer group">
                  <div className="w-12 h-12 rounded-2xl bg-base-200 group-hover:bg-primary/10 group-hover:text-primary grid place-items-center text-heledone-ink-muted transition-colors">
                    <UploadCloud size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-base-content">
                      {t('برای انتخاب فایل کلیک کنید یا فایل را اینجا بکشید')}
                    </p>
                    <p className="text-[10px] text-heledone-ink-muted mt-0.5">
                      {t('فایل‌های مجاز: تصاویر، اسناد، PDF و فشرده')}
                    </p>
                  </div>
                  <input
                    type="file"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setUploadFile(f);
                        if (f.type.startsWith('image/')) {
                          setUploadPreviewUrl(URL.createObjectURL(f));
                        }
                      }
                    }}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-base-200/50 border border-base-300/60">
                  <div className="shrink-0 w-12 h-12 rounded-xl bg-base-100 grid place-items-center overflow-hidden shadow-2xs">
                    {uploadPreviewUrl ? (
                      <img src={uploadPreviewUrl} alt={uploadFile.name} className="w-full h-full object-cover" />
                    ) : (
                      <FileText size={24} className="text-primary" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-base-content truncate">
                      {uploadFile.name}
                    </p>
                    <p className="text-[10px] text-heledone-ink-muted mt-0.5">
                      {`${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB`}
                    </p>
                  </div>
                  <label className="px-2.5 py-1 rounded-lg bg-base-200 hover:bg-base-300 text-[11px] font-bold text-base-content cursor-pointer transition-colors">
                    <span>{t('تغییر فایل')}</span>
                    <input
                      type="file"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setUploadFile(f);
                          if (f.type.startsWith('image/')) {
                            setUploadPreviewUrl(URL.createObjectURL(f));
                          } else {
                            setUploadPreviewUrl(null);
                          }
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Description & Mention (Optional) */}
              <div>
                <label className="block text-xs font-bold text-base-content mb-1.5">
                  {t('توضیحات و منشن همکاران (اختیاری):')}
                </label>
                <MentionTextarea
                  value={uploadDescription}
                  onChange={setUploadDescription}
                  members={formattedMembers}
                  placeholder={t('توضیحات اختیاری بنویسید… (از @ برای منشن کردن همکاران استفاده کنید)')}
                  rows={4}
                  className="w-full text-xs p-3 rounded-xl border border-base-300 focus:border-primary bg-base-100 transition-all focus:outline-none"
                />
              </div>

              {/* Quick Member Tags */}
              {formattedMembers.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold text-heledone-ink-muted">
                    {t('انتخاب سریع اعضا:')}
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                    {formattedMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          const tag = `@${m.username} `;
                          if (!uploadDescription.includes(`@${m.username}`)) {
                            setUploadDescription((prev) => (prev ? `${prev} ${tag}` : tag));
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-base-200 hover:bg-primary/10 hover:text-primary text-[11px] font-bold text-base-content transition-all cursor-pointer"
                      >
                        <span className="text-primary font-black">@</span>
                        <span>{m.username}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-base-300/80 bg-base-200/30">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                disabled={isUploading}
                className="px-4 py-2 rounded-xl border border-base-300 hover:bg-base-200 text-xs font-bold text-base-content transition-colors cursor-pointer"
              >
                {t('انصراف')}
              </button>
              <button
                type="button"
                onClick={handleUploadSubmit}
                disabled={isUploading || !uploadFile}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-[#006D73] text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isUploading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Upload size={14} />
                )}
                <span>
                  {uploadDescription.includes('@')
                    ? t('آپلود و ارسال منشن')
                    : t('آپلود فایل')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirm Delete Modal ─── */}
      {fileToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!isDeleting) setFileToDelete(null);
          }}
        >
          <div
            className="relative max-w-sm w-full bg-base-100 rounded-3xl overflow-hidden shadow-2xl border border-base-300/80 p-5 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-error/10 text-error grid place-items-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-base-content">
                  {t('حذف فایل')}
                </h3>
                <p className="text-xs text-heledone-ink-muted mt-0.5">
                  {t('آیا از حذف این فایل مطمئن هستید؟')}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-base-200/50 border border-base-300/60 flex items-center gap-2.5">
              <div className="shrink-0">
                {renderFileIcon(fileToDelete.fileType)}
              </div>
              <p className="font-bold text-xs text-base-content truncate flex-1">
                {fileToDelete.name}
              </p>
            </div>

            <p className="text-[11px] text-error font-medium">
              {t('این عملیات غیرقابل بازگشت است.')}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-base-300/60">
              <button
                type="button"
                onClick={() => setFileToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-base-300 hover:bg-base-200 text-xs font-bold text-base-content transition-colors cursor-pointer"
              >
                {t('انصراف')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-error hover:bg-error/90 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                {isDeleting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>{t('حذف فایل')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
