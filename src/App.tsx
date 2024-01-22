import React, {useCallback, useEffect, useRef, useState} from "react"
import {bitable, IEventCbCtx, IFieldMeta, ITable, IView, Selection, ToastType} from "@lark-base-open/js-sdk"
import ClipboardJS from "clipboard";
import i18n from "i18next";
import './locales/i18n'
import {Button, CheckboxGroup, Spin, TextArea} from "@douyinfe/semi-ui";
import {Checkbox} from "@douyinfe/semi-ui/lib/es/checkbox";


export default function AsciiDocExporter() {
    new ClipboardJS(".clipboard");

    const [isReady, setIsReady] = useState(false);
    const [isLoadingVisible, setIsLoadingVisible] = useState(false);
    const [isLoadingSelected, setIsLoadingSelected] = useState(false);
    const activeTable = useRef<ITable | undefined>(undefined);
    const activeView = useRef<IView | undefined>(undefined);
    const fieldMetaList = useRef<IFieldMeta[]>([]);
    const selectedFieldMetaList = useRef<IFieldMeta[]>([]);
    const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);

    const [totalRecords, setTotalRecords] = useState(0);
    const [currentRecord, setCurrentRecord] = useState(0);
    const [duration, setDuration] = useState(0);
    const [asciiDoc, setAsciiDoc] = useState("");

    const init = async () => {
        const table = await bitable.base.getActiveTable();
        activeTable.current = table;
        const view = await table.getActiveView();
        activeView.current = view;
        fieldMetaList.current = await view.getFieldMetaList();
        selectedFieldMetaList.current = [...fieldMetaList.current];
        setSelectedFieldIds(fieldMetaList.current.map(f=>f.id));

        setDuration(0);
        setTotalRecords(0);
    };

    // 获取当前选中地数据表实例
    useEffect(() => {
        init().then(value => setIsReady(true));
    }, []);

    // 监听数据表变化
    bitable.base.onSelectionChange((e: IEventCbCtx<Selection>) => {
        if (activeTable.current?.id !== e.data.tableId || activeView.current?.id !== e.data.viewId) {
            setIsReady(false);
            setAsciiDoc("");
            init().then(value => setIsReady(true));
        }
    });

    const onCheckedFieldChange = (ids: string[]) => {
        setSelectedFieldIds(ids)
        selectedFieldMetaList.current = fieldMetaList.current.filter(f=>ids.includes(f.id));
    };
    const onCheckAllFieldsChange = (e: any) => {
        if (e.target.checked) {
            selectedFieldMetaList.current = [...fieldMetaList.current];
            setSelectedFieldIds(selectedFieldMetaList.current.map(f=>f.id));
        } else {
            selectedFieldMetaList.current = [];
            setSelectedFieldIds([]);
        }
    };

    /**
     * Export table data to AsciiDoc format.
     * @param {Object} options - Export options.
     * @param {ITable} options.table - The table to export.
     * @param {IView} options.view - The view to export.
     * @param {string[]} options.recordIds - List of record IDs to export.
     */
    const exportToAsciiDoc = useCallback(async ({recordIds}: {
            recordIds: (string | undefined)[];
        }) => {
            try {
                const timeStart = Date.now();

                // 获取表头
                const headers = selectedFieldMetaList.current.map(f => f.name);
                let asciiDocTable = `[cols="${headers.length}*", options="header"]\n`;
                asciiDocTable += "|===\n";
                for (const th of headers) {
                    asciiDocTable += `|${th}\n`;
                }
                asciiDocTable += "\n";

                let recordIdx = 1;
                setTotalRecords(recordIds.length);
                for (const recordId of recordIds) {
                    setCurrentRecord(recordIdx++);
                    if (!recordId) {
                        continue;
                    }

                    for (const fieldMeta of selectedFieldMetaList.current) {
                        const field = await activeTable.current?.getFieldById(fieldMeta.id);
                        const cellString = await field?.getCellString(recordId);
                        asciiDocTable += `|${cellString}\n`;
                    }
                    asciiDocTable += "\n";

                    const timeEnd = Date.now();
                    setDuration(timeEnd - timeStart);
                    setAsciiDoc(asciiDocTable);
                }

                asciiDocTable += "|===";
                const timeEnd = Date.now();
                setDuration(timeEnd - timeStart);

                // 展示部分结果
                setAsciiDoc(asciiDocTable);
            } catch (err: any) {
                console.log(err);
                await bitable.ui.showToast({
                    toastType: ToastType.error,
                    message: i18n.t("errorMsgExportFailed"),
                });
            } finally {
                setTotalRecords(0);
                setCurrentRecord(0);
            }
        },
        []
    );

    /**
     * 导出当前页
     */
    const exportVisible = useCallback(async () => {
        setIsLoadingVisible(true);
        try {
            if (!activeView) {
                return;
            }
            const recordIds = await activeView.current?.getVisibleRecordIdList();
            if (!recordIds) {
                return;
            }
            await exportToAsciiDoc({recordIds});
        } finally {
            setIsLoadingVisible(false);
        }
    }, [activeView]);

    /**
     * 导出选择部分
     */
    const exportSelected = useCallback(async () => {
        setIsLoadingSelected(true);
        try {
            const {tableId, viewId} = await bitable.base.getSelection();
            if (!tableId || !viewId) {
                await bitable.ui.showToast({
                    toastType: ToastType.error,
                    message: i18n.t("errorMsgGetSelectionFailed"),
                });
                return;
            }
            const recordIds = await bitable.ui.selectRecordIdList(tableId, viewId);
            await exportToAsciiDoc({recordIds});
        } finally {
            setIsLoadingSelected(false);
        }
    }, [activeView]);

    /**
     * 复制到粘贴板
     */
    const copyToClipboard = useCallback(async () => {
        await bitable.ui.showToast({
            message: i18n.t("successMsgCopied"),
            toastType: ToastType.success,
        });
    }, []);

    /**
     * 导出 asciiDoc 并下载为文件
     */
    const download = useCallback(async () => {
        try {
            const blob = new Blob([asciiDoc], {type: "text/plain"});
            const downloadLink = document.createElement("a");
            downloadLink.href = URL.createObjectURL(blob);
            downloadLink.download = `${activeTable.current?.getName()}-${Date.now()}.asciidoc`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
        } catch (err: any) {
            await bitable.ui.showToast({
                message: i18n.t("errorMsgDownloadFailed"),
                toastType: ToastType.error,
            });
        }
    }, [asciiDoc]);

    /**
     * 清楚预览文本区域地内容
     */
    const clearContent = useCallback(async () => {
        setAsciiDoc("");
    }, [asciiDoc]);


    if (!isReady) {
        return (
            <div>
                <div>
                    <Spin size="middle"/>
                </div>
                <div>{i18n.t("initializingText")}</div>
            </div>
        );
    }

    return (
        <div>
            <div>
                <div style={{fontWeight: "bold", paddingBottom: 8, borderBottom: '1px solid var(--semi-color-border)'}}
                >
                    {i18n.t("selectFieldsTxt")}
                </div>
                <div>
                    <div style={{paddingTop: 8,}}>
                        <Checkbox
                            indeterminate={selectedFieldIds.length !== fieldMetaList.current.length}
                            onChange={onCheckAllFieldsChange}
                            checked={selectedFieldIds.length === fieldMetaList.current.length}
                        >
                            {i18n.t("selectAllTxt")}
                        </Checkbox>
                    </div>
                    <CheckboxGroup
                        style={{marginTop: 6, width: "100%"}}
                        direction={"horizontal"}
                        options={fieldMetaList.current.map(f => {
                            return {label: f.name, value: f.id}
                        })}
                        value={selectedFieldIds}
                        onChange={onCheckedFieldChange}
                    />
                </div>
            </div>
            <div style={{fontWeight: "bold", paddingTop: 8, borderBottom: '1px solid var(--semi-color-border)'}}></div>
            <div style={{marginTop: 10}}>
                <Button
                    theme="solid"
                    style={{marginRight: 8, marginTop: 8}}
                    loading={isLoadingVisible}
                    disabled={isLoadingSelected}
                    onClick={exportVisible}
                >
                    {i18n.t("exportVisibleBtnTxt")}
                </Button>
                <Button
                    theme="solid"
                    style={{marginRight: 8, marginTop: 8}}
                    loading={isLoadingSelected}
                    disabled={isLoadingVisible}
                    onClick={exportSelected}
                >
                    {i18n.t("exportSelectedBtnTxt")}
                </Button>
            </div>

            {(isLoadingVisible || isLoadingSelected) && totalRecords > 0 && (
                <div>
                    <div>
                        {i18n.t("exportingText")} {currentRecord}/{totalRecords}
                    </div>
                </div>
            )}
            <div>
                {duration > 0 && (
                    <div>
                        {i18n.t("totalTimeTxt")}
                        {Math.floor(duration / 1000)}
                        {i18n.t("totalTimeUnitTxt")}
                    </div>
                )}
            </div>

            {asciiDoc && (
                <div>
                    <div>
                        <Button
                            className="clipboard"
                            style={{marginRight: 8, marginTop: 8}}
                            theme="solid"
                            data-clipboard-text={asciiDoc}
                            onClick={copyToClipboard}
                        >
                            {i18n.t("copyBtnTxt")}
                        </Button>

                        <Button theme="solid"
                                style={{marginRight: 8, marginTop: 8}}
                                onClick={download}>
                            {i18n.t("downloadBtnTxt")}
                        </Button>
                        <Button theme="solid"
                                style={{marginRight: 8, marginTop: 8}}
                                onClick={clearContent}>
                            {i18n.t("clearContentBtnTxt")}
                        </Button>
                    </div>
                </div>

            )}

            {asciiDoc && (
                <TextArea
                    id="asciiDocText"
                    value={asciiDoc}
                    autosize={true}
                />
            )}
        </div>
    );
};