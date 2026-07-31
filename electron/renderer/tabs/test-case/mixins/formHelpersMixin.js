// Private Helpers mixin for TestCaseView
// Extracted from formMixin.js during sub-refactor
// Provides: _getElementLocatorType + _getFakerProviders (data lookup helpers)

export const formHelpersMixin = {
    // ─── Private Helpers ───────────────────────────────────────────

    _getElementLocatorType(pageId, elementId, app) {
        if (pageId && elementId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            const element = page?.elements?.find(el => el.id === elementId);
            return element?.locator || null;
        }
        return null;
    },

    _getFakerProviders() {
        return {
            'zh_CN': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '张三' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '13812345678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'zhangsan@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '北京市' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '朝阳区xxx街道' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '科技有限公司' }
            ],
            'en_US': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: 'John Smith' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '+1-555-123-4567' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'john@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: 'New York' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '123 Main St' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: 'Tech Corp' }
            ],
            'ja_JP': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '田中太郎' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '090-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'tanaka@example.jp' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '東京都' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '渋谷区xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '株式会社テック' }
            ],
            'ko_KR': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '김철수' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '010-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'kim@example.kr' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '서울특별시' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '강남구 xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '테크주식회사' }
            ]
        };
    },
};
